import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import sharp from "sharp";
import { captureProduct, type ProductResearch } from "./capture.js";
import {
  buildStoryboard, lockTimings, pickVoice, renderComposition, scriptMarkdown, storyboardFromPlan, synthesizeVoiceover,
  type CompositionInput, type ReferenceBeats,
} from "./compose.js";
import { directCreativePlan, hermesProduce } from "./director.js";
import { generateHookClip, type HookBrief } from "./generate.js";
import type { JobStage, LaunchJob } from "./types.js";

/** Anything that can persist job state — the local JobStore or the Convex-backed sink. */
export interface JobSink {
  save(job: LaunchJob): Promise<void>;
  transition(job: LaunchJob, stage: JobStage, message: string): Promise<void>;
}

const ROOT = resolve(process.cwd(), process.cwd().endsWith("apps/api") ? "../.." : ".");
const RUNS = join(ROOT, "runs");
const DECONSTRUCTOR = join(ROOT, "packages/video-deconstruct/src/deconstruct.py");

function exec(command: string, args: string[], timeoutMs = 240_000, cwd?: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const detached = process.platform !== "win32";
    const child = spawn(command, args, { cwd: cwd ?? ROOT, env: process.env, detached });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const append = (current: string, chunk: Buffer) => (current + chunk.toString()).slice(-1_000_000);
    const terminate = (signal: NodeJS.Signals) => {
      try {
        if (detached && child.pid) process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch {
        // The process may have exited between the timeout and the signal.
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      terminate("SIGTERM");
      setTimeout(() => terminate("SIGKILL"), 2_000).unref();
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => (stdout = append(stdout, chunk)));
    child.stderr.on("data", (chunk: Buffer) => (stderr = append(stderr, chunk)));
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) reject(new Error(`${command} timed out`));
      else if (code === 0) resolvePromise({ stdout, stderr });
      else reject(new Error(stderr || `${command} exited ${code}`));
    });
  });
}

async function researchProduct(url: string): Promise<{ title: string; summary: string }> {
  const hostname = new URL(url).hostname.replace(/^www\./, "");
  const title = hostname.split(".")[0]?.replace(/[-_]/g, " ") || "Product";
  const displayTitle = title.replace(/\b\w/g, (letter) => letter.toUpperCase());
  return {
    title: displayTitle.slice(0, 100),
    summary: `Local pipeline preview for ${hostname}. Live product-page research will be enabled with the production network policy.`,
  };
}

function artifactUrl(jobId: string, file: string): string {
  return `/runs/${jobId}/${file}`;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function renderTitleCard(lines: string[], target: string, width: number, height: number,
                               background: string, foreground: string): Promise<void> {
  const fontSize = Math.round(width * 0.057);
  const lineHeight = Math.round(fontSize * 1.12);
  const firstY = Math.round(height / 2 - ((lines.length - 1) * lineHeight) / 2);
  const text = lines.map((line, index) =>
    `<text x="${width / 2}" y="${firstY + index * lineHeight}" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="800" letter-spacing="-2" fill="${foreground}">${escapeXml(line)}</text>`
  ).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${background}"/>${text}</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(target);
}

export async function renderFallback(job: LaunchJob, runDir: string): Promise<string> {
  const size = job.format === "portrait" ? "1080x1920" : "1280x720";
  const parsed = size.split("x").map(Number);
  const width = parsed[0] ?? 1280;
  const height = parsed[1] ?? 720;
  const scenes = [
    { lines: [job.title ?? "Your product", "DESERVES A LAUNCH."], background: "#1c1915", foreground: "#f6efe3" },
    { lines: ["REAL UI.", "YOUR TASTE.", "ONE AGENT CREW."], background: "#ef5b35", foreground: "#191714" },
    { lines: ["LAUNCHREEL", "FROM URL TO MP4."], background: "#1c1915", foreground: "#f6efe3" },
  ];
  const images: string[] = [];
  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index];
    if (!scene) continue;
    const image = join(runDir, `scene-${index + 1}.png`);
    await renderTitleCard(scene.lines, image, width, height, scene.background, scene.foreground);
    images.push(image);
  }
  const output = join(runDir, "draft.mp4");
  const inputArgs = images.flatMap((image) => ["-loop", "1", "-framerate", "30", "-t", "4", "-i", image]);
  const filters = images.map((_, index) => `[${index}:v]fps=30,format=yuv420p[v${index}]`);
  filters.push(`${images.map((_, index) => `[v${index}]`).join("")}concat=n=${images.length}:v=1:a=0[outv]`);
  await exec("ffmpeg", [
    "-y", "-v", "error", ...inputArgs,
    "-filter_complex", filters.join(";"), "-map", "[outv]", "-c:v", "libx264",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", output,
  ]);
  return output;
}

export async function runJob(job: LaunchJob, store: JobSink): Promise<void> {
  const runDir = join(RUNS, job.id);
  const attemptName = `attempt-${Date.now()}`;
  const attemptDir = join(runDir, attemptName);
  const log = (message: string) => process.stderr.write(`[LaunchReel job ${job.id}] ${message}\n`);
  try {
    await mkdir(attemptDir, { recursive: true });

    await store.transition(job, "researching", "Researcher is capturing the product site, brand tokens, and company context");
    const research = await captureProduct(job.productUrl, attemptDir, exec).catch(async (error) => {
      log(`Site capture failed (${error instanceof Error ? error.message : error}); falling back to URL-only identity`);
      const fallback = await researchProduct(job.productUrl);
      return {
        title: fallback.title, headline: fallback.title, tagline: fallback.summary, summary: fallback.summary,
        features: [], colors: { base: "#15130f", surface: "#f7f2e8", accent: "#ef5b35", foreground: "#f7f2e8" },
        fonts: [], screenshots: [], context: undefined, captureDir: attemptDir,
      } satisfies ProductResearch;
    });
    job.title = research.title;
    job.productSummary = research.summary;
    await store.save(job);

    await store.transition(job, "analyzing_reference", "Style analyst is mapping cuts, beats, motion, and sound");
    const analysisDir = join(attemptDir, "analysis");
    await exec("python3", [DECONSTRUCTOR, job.inspiration, "--out", analysisDir, "--fast"]);
    job.artifacts.breakdown = artifactUrl(job.id, `${attemptName}/analysis/BREAKDOWN.md`);
    job.artifacts.styleBrief = artifactUrl(job.id, `${attemptName}/analysis/style-brief.md`);
    job.artifacts.beats = artifactUrl(job.id, `${attemptName}/analysis/beats.json`);
    job.artifacts.contactSheet = artifactUrl(job.id, `${attemptName}/analysis/contact-sheet.png`);
    await store.save(job);

    await store.transition(job, "writing_script", "Hermes director is planning the film: script, storyboard, shots, treatments");
    const styleBrief = await readFile(join(analysisDir, "style-brief.md"), "utf8").catch(() => "");
    let beats: ReferenceBeats & { transcript?: string } = {};
    try {
      beats = JSON.parse(await readFile(join(analysisDir, "beats.json"), "utf8")) as ReferenceBeats & { transcript?: string };
    } catch {
      // Beats are advisory; the storyboard has its own defaults.
    }
    // DIRECTOR_MODE=full → Hermes owns the whole production: it reads the
    // capture + breakdown and drives HyperFrames/Lumenfall/TTS itself.
    if ((process.env.DIRECTOR_MODE ?? "full").toLowerCase() === "full") {
      await store.transition(job, "rendering", "Hermes is producing the film end-to-end: script, shots, narration, composition, render");
      const produced = await hermesProduce(
        { research, styleBrief, beats, transcript: beats.transcript ?? "", format: job.format, productUrl: job.productUrl, attemptDir },
        exec,
        log,
      );
      if (produced) {
        for (const [key, file] of [["script", "SCRIPT.md"], ["video", "launchreel.mp4"]] as const) {
          job.artifacts[key] = artifactUrl(job.id, `${attemptName}/${file}`);
        }
        await store.transition(job, "completed", "Hermes director delivered and verified the film");
        return;
      }
      log("Full Hermes production did not deliver; falling back to the plan-mode pipeline");
      await store.transition(job, "writing_script", "Falling back to the plan-directed pipeline");
    }

    const plan = await directCreativePlan(
      { research, styleBrief, beats, transcript: beats.transcript ?? "", format: job.format, productUrl: job.productUrl },
      exec,
      log,
    );
    if (plan) await writeFile(join(attemptDir, "creative-plan.json"), JSON.stringify(plan, null, 2));
    const storyboard = plan
      ? storyboardFromPlan(plan, research, beats)
      : buildStoryboard(research, beats, job.format);
    const compositionInput: CompositionInput = {
      research,
      scenes: storyboard.scenes,
      format: job.format,
      productUrl: job.productUrl,
    };

    // The AI hook clip generates while narration and the composition are assembled.
    const plannedShot = plan?.lumenfallShots[0];
    const hookBrief: HookBrief = {
      productTitle: research.title,
      productSummary: research.context ?? research.summary,
      styleText: `${styleBrief}\n${storyboard.styleNotes}`,
      format: job.format,
      baseColor: research.colors.base,
      accentColor: research.colors.accent,
      promptOverride: plannedShot?.prompt,
      modelHint: plannedShot?.modelHint,
    };
    const hookPromise = generateHookClip(hookBrief, join(attemptDir, "hook.mp4"), log).catch((error) => {
      log(`Hook generation crashed (${error instanceof Error ? error.message : error})`);
      return null;
    });

    const assetsDir = join(attemptDir, "video-assets");
    await mkdir(assetsDir, { recursive: true });
    const narrator = pickVoice(
      `${plan?.narratorStyle ?? ""}\n${styleBrief}\n${research.summary}\n${research.context ?? ""}`,
      storyboard.fast,
    );
    await synthesizeVoiceover(storyboard.scenes, assetsDir, exec, log, narrator);

    await writeFile(join(attemptDir, "SCRIPT.md"), scriptMarkdown(compositionInput, storyboard.styleNotes));
    job.artifacts.script = artifactUrl(job.id, `${attemptName}/SCRIPT.md`);
    await store.save(job);

    await store.transition(job, "rendering", "Video producer is compositing real UI, narration, and the AI hook shot");
    compositionInput.hook = await hookPromise;
    lockTimings(storyboard.scenes, compositionInput.hook);
    // Re-emit the script with final locked timings.
    await writeFile(join(attemptDir, "SCRIPT.md"), scriptMarkdown(compositionInput, storyboard.styleNotes));

    let output: string;
    try {
      output = join(attemptDir, "launchreel.mp4");
      await renderComposition(compositionInput, join(attemptDir, "video"), output, exec);
    } catch (error) {
      log(`HyperFrames render failed (${error instanceof Error ? error.message : error}); using the title-card fallback`);
      output = await renderFallback(job, attemptDir);
    }
    job.artifacts.video = artifactUrl(job.id, `${attemptName}/${basename(output)}`);
    await store.transition(job, "completed", "Director reviewed the render and packaged the deliverables");
  } catch (error) {
    const detail = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`[LaunchReel job ${job.id}] ${detail}\n`);
    job.error = error instanceof Error && error.message.includes("timed out")
      ? "A production tool timed out. Retry the job or use a shorter reference."
      : "A production stage failed. Check the local API log for details, then retry.";
    await store.transition(job, "failed", "Director stopped the run and preserved a safe failure summary");
  }
}
