import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import sharp from "sharp";
import type { LaunchJob } from "./types.js";
import { JobStore } from "./store.js";

const ROOT = resolve(process.cwd(), process.cwd().endsWith("apps/api") ? "../.." : ".");
const RUNS = join(ROOT, "runs");
const DECONSTRUCTOR = join(ROOT, "packages/video-deconstruct/src/deconstruct.py");

function exec(command: string, args: string[], timeoutMs = 240_000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const detached = process.platform !== "win32";
    const child = spawn(command, args, { cwd: ROOT, env: process.env, detached });
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

async function writeScript(job: LaunchJob, styleBrief: string, runDir: string): Promise<string> {
  const script = `# ${job.title ?? "Product"} local pipeline preview\n\n## Card 1 (0–4s)\n${job.title ?? "Your product"} deserves a launch.\n\n## Card 2 (4–8s)\nReal UI. Your taste. One agent crew.\n\n## Card 3 (8–12s)\nLaunchReel: from URL to MP4.\n\n---\n\nThis local MVP validates intake, reference analysis, style priors, scripting, job state, and MP4 delivery. Product capture, narration, captions, and the 30–60 second HyperFrames render are the next adapter.\n\nStyle prior loaded from the reference:\n${styleBrief.slice(0, 1200)}\n`;
  const file = join(runDir, "SCRIPT.md");
  await writeFile(file, script);
  return file;
}

export async function runJob(job: LaunchJob, store: JobStore): Promise<void> {
  const runDir = join(RUNS, job.id);
  const attemptName = `attempt-${Date.now()}`;
  const attemptDir = join(runDir, attemptName);
  try {
    await mkdir(attemptDir, { recursive: true });
    await store.transition(job, "researching", "Researcher is preparing the product identity for the local preview");
    const research = await researchProduct(job.productUrl);
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

    await store.transition(job, "writing_script", "Scriptwriter is adapting the story to the product");
    const styleBrief = await readFile(join(analysisDir, "style-brief.md"), "utf8");
    await writeScript(job, styleBrief, attemptDir);
    job.artifacts.script = artifactUrl(job.id, `${attemptName}/SCRIPT.md`);
    await store.save(job);

    await store.transition(job, "rendering", "Video producer is rendering the first playable preview");
    const output = await renderFallback(job, attemptDir);
    job.artifacts.video = artifactUrl(job.id, `${attemptName}/${basename(output)}`);
    await store.transition(job, "completed", "Director packaged the verified local pipeline preview");
  } catch (error) {
    const detail = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`[LaunchReel job ${job.id}] ${detail}\n`);
    job.error = error instanceof Error && error.message.includes("timed out")
      ? "A production tool timed out. Retry the job or use a shorter reference."
      : "A production stage failed. Check the local API log for details, then retry.";
    await store.transition(job, "failed", "Director stopped the run and preserved a safe failure summary");
  }
}
