import type { ProductResearch } from "./capture.js";
import type { ReferenceBeats } from "./compose.js";
import type { JobFormat } from "./types.js";

type Exec = (command: string, args: string[], timeoutMs?: number) => Promise<{ stdout: string; stderr: string }>;

export interface PlannedScene {
  id: string;
  kind: "hook" | "promise" | "ui" | "stack" | "cta";
  seconds: number;
  voLine: string;
  title?: string;
  sub?: string;
  caption?: string;
  screenshotIndex?: number;
}

export interface PlannedShot {
  sceneId: string;
  prompt: string;
  modelHint?: string;
}

export interface CreativePlan {
  concept: string;
  narratorStyle: string;
  scenes: PlannedScene[];
  lumenfallShots: PlannedShot[];
}

const SCENE_KINDS = new Set(["hook", "promise", "ui", "stack", "cta"]);

export function validatePlan(raw: unknown): CreativePlan {
  const plan = raw as Partial<CreativePlan>;
  if (!plan || typeof plan !== "object") throw new Error("Plan is not an object");
  if (!Array.isArray(plan.scenes) || plan.scenes.length < 4 || plan.scenes.length > 10) {
    throw new Error("Plan needs 4-10 scenes");
  }
  const seenIds = new Set<string>();
  for (const scene of plan.scenes) {
    if (!scene || typeof scene.id !== "string" || !scene.id.trim()) throw new Error("Scene missing id");
    if (seenIds.has(scene.id)) throw new Error(`Duplicate scene id ${scene.id}`);
    seenIds.add(scene.id);
    if (!SCENE_KINDS.has(scene.kind as string)) throw new Error(`Unknown scene kind ${String(scene.kind)}`);
    if (typeof scene.voLine !== "string") throw new Error("Scene missing voLine");
    if (typeof scene.seconds !== "number" || !Number.isFinite(scene.seconds)) throw new Error("Scene missing seconds");
  }
  if (plan.scenes[0]?.kind !== "hook") throw new Error("First scene must be the hook");
  if (plan.scenes[plan.scenes.length - 1]?.kind !== "cta") throw new Error("Last scene must be the cta");
  const total = plan.scenes.reduce((sum, scene) => sum + scene.seconds, 0);
  if (total < 20 || total > 60) throw new Error(`Plan duration ${total.toFixed(1)}s outside 20-60s`);
  const shots = Array.isArray(plan.lumenfallShots) ? plan.lumenfallShots.slice(0, 2) : [];
  for (const shot of shots) {
    if (!shot || typeof shot.prompt !== "string" || shot.prompt.length < 20) throw new Error("Shot prompt too short");
    if (typeof shot.sceneId !== "string") throw new Error("Shot missing sceneId");
  }
  return {
    concept: typeof plan.concept === "string" ? plan.concept : "Product launch film",
    narratorStyle: typeof plan.narratorStyle === "string" ? plan.narratorStyle : "default",
    scenes: plan.scenes as PlannedScene[],
    lumenfallShots: shots as PlannedShot[],
  };
}

export interface DirectorInputs {
  research: ProductResearch;
  styleBrief: string;
  beats: ReferenceBeats;
  transcript: string;
  format: JobFormat;
  productUrl: string;
}

export function buildDirectorPrompt(inputs: DirectorInputs): string {
  const { research, styleBrief, beats, format, productUrl } = inputs;
  const pacing = beats.pacing?.cuts_per_sec_by_third?.map((n) => n.toFixed(2)).join(", ") ?? "unknown";
  return `You are the creative director of LaunchReel, an AI launch-video agency. Direct a ${format} software launch film for this product. You decide the story, script, shot plan, and treatments; a deterministic renderer executes your plan exactly.

## Product research (captured from ${productUrl})
- Name: ${research.title}
- Headline on site: ${research.headline}
- Tagline/description: ${research.tagline}
- Feature headings found on the page: ${research.features.join(" | ") || "none captured"}
- Brand: base ${research.colors.base}, accent ${research.colors.accent}
- Screenshots available: ${research.screenshots.length} (index 0 = hero/top of page, then progressively deeper scrolls)
${research.context ? `- Company context: ${research.context}` : ""}

## Reference video analysis (structure to transfer — NEVER copy its content)
- Arc: ${beats.arc ?? "unknown"}; audio mode: ${beats.vo_mode ?? "unknown"}; duration ${beats.meta?.duration ?? "?"}s
- Cuts per second by third: ${pacing}
- Reference transcript (for pacing/tone study only, do not reuse wording): ${inputs.transcript.slice(0, 500) || "none"}
- Style brief:
${styleBrief.slice(0, 900)}

## Rules
- First 5 seconds must make a concrete promise or expose a concrete pain.
- Every claim must be grounded in the captured site copy above. No invented features.
- Voiceover lines are conversational, punchy, 4-14 words each. They are read aloud by TTS.
- Transfer the reference's structure and pacing, never its words, footage, or branding.
- Scene kinds available to you: "hook" (AI b-roll or gradient + big headline), "promise" (typographic statement card), "ui" (real product screenshot with caption chip — use screenshotIndex), "stack" (3-item feature list; put the 3 items in "sub" separated by " · "), "cta" (closing card with product name + URL pill).
- First scene must be kind "hook", last must be "cta". Use 2-3 "ui" scenes — the real UI is the star.
- Total duration 28-45 seconds. Scene seconds between 3 and 8.
- lumenfallShots: at most 1, for the hook scene — a wordless cinematic AI-video prompt (explicitly say: no on-screen text, no logos, no people) that matches the brand colors and product mood. Optional modelHint: one of kling-v3, veo-3.1-fast, sora-2, pixverse-v5.6, or omit for auto.

## Output
Reply with ONLY a JSON object, no prose, no markdown fences:
{"concept":"one line","narratorStyle":"energetic|cinematic|technical|warm|default","scenes":[{"id":"hook","kind":"hook","seconds":4.5,"voLine":"...","title":"..."},{"id":"s2","kind":"promise","seconds":4,"voLine":"...","title":"..."},{"id":"s3","kind":"ui","seconds":5,"voLine":"...","caption":"...","screenshotIndex":0}, ...,{"id":"cta","kind":"cta","seconds":4.5,"voLine":"...","title":"${research.title}"}],"lumenfallShots":[{"sceneId":"hook","prompt":"...","modelHint":"auto"}]}`;
}

function extractJson(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/g, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("Director returned no JSON object");
  return JSON.parse(cleaned.slice(start, end + 1));
}

export interface ProduceInputs extends DirectorInputs {
  attemptDir: string;
}

function productionBrief(inputs: ProduceInputs): string {
  const { research, beats, format, productUrl } = inputs;
  const dims = format === "portrait" ? "1080x1920 (9:16)" : "1920x1080 (16:9)";
  return `# LaunchReel production brief

You are the Hermes director-producer for LaunchReel. Produce a finished software launch film for **${research.title}** (${productUrl}) in THIS directory, end to end, autonomously. You own script, storyboard, shot plan, treatments, and the render.

## Output contract (all paths relative to this directory)
- \`launchreel.mp4\` — the film. ${dims}, H.264 + AAC audio, 28-45 seconds. THIS FILE IS THE DELIVERABLE; the job fails without it.
- \`SCRIPT.md\` — timeline table: time range, scene, voiceover line, on-screen text.
- \`creative-plan.json\` — your concept, narrator choice, scene list, and shot plan.

## Inputs already gathered for you
- \`capture/screenshots/\` — real product UI screenshots (scroll order). The real UI is the star of the film.
- \`capture/extracted/tokens.json\` — page title, description, headings, brand colors, fonts. \`capture/assets/\` has downloaded brand assets.
- \`analysis/BREAKDOWN.md\`, \`analysis/style-brief.md\`, \`analysis/beats.json\`, \`analysis/contact-sheet.png\` — frame-by-frame deconstruction of the client's inspiration video (arc: ${beats.arc ?? "unknown"}, ${beats.meta?.duration ?? "?"}s). Transfer its structure and pacing, never its words, footage, or branding.
- Research summary: headline "${research.headline}"; tagline "${research.tagline}"; features: ${research.features.join(" | ") || "see tokens.json"}; brand base ${research.colors.base}, accent ${research.colors.accent}.${research.context ? `\n- Company context: ${research.context}` : ""}

## Workflow (STRICT ORDER — AI shots come first, then the edit)
1. **Phase 1 — generate AI shots (REQUIRED unless LUMENFALL_API_KEY is unset/empty):** write your shot prompts, kick off 1-2 Lumenfall generations IMMEDIATELY, and download them to \`ai-shots/shot-1.mp4\` (and \`shot-2.mp4\`). Do this BEFORE authoring the composition; you may write SCRIPT.md and scaffold while they render.
2. **Phase 2 — edit in HyperFrames:** author the composition USING the downloaded AI shots as \`<video>\` clip sources (the hook scene MUST play \`ai-shots/shot-1.mp4\` full-bleed under the headline). UI screenshot scenes and type cards fill the rest. Then check + render.
A film with zero AI shots is a FAILED deliverable whenever LUMENFALL_API_KEY is set — do not skip Phase 1 or render without wiring the downloaded files into the timeline.

## Skills — use your installed skills, do not improvise the workflow
You have the HyperFrames skill suite installed natively. LOAD AND FOLLOW your **product-launch-video** skill as the master workflow for this film (skip its site-capture step — \`capture/\` is already done, and keep this brief's output contract). Consult **hyperframes-core** (composition contract), **hyperframes-animation** (motion rules, scene blueprints), **hyperframes-creative** (palette, typography, beats), and **hyperframes-media** / **media-use** (voiceover, BGM, SFX).

## Tools available
- **HyperFrames** (primary renderer/editor): \`npx hyperframes init <dir>\`, author \`index.html\` composition (GSAP timeline, data-start/data-duration/data-track-index clips; local mp4s go in \`<video>\` elements with class="clip" — framework owns playback). \`npx hyperframes check <dir>\`, \`npx hyperframes render <dir> -o launchreel.mp4 --quality standard\`.
- **Lumenfall** (AI shots): \`curl -X POST https://api.lumenfall.ai/openai/v1/videos -H "Authorization: Bearer $LUMENFALL_API_KEY" -H "content-type: application/json" -d '{"model":"...","prompt":"...","seconds":"4","aspect_ratio":"${format === "portrait" ? "9:16" : "16:9"}"}'\` then poll \`GET /videos/<id>\` until completed and download output.url. Models: kling-v3, veo-3.1-fast, sora-2, pixverse-v5.6, veo-3.1-lite. HARD BUDGET: $2.50 total. Prompts must be wordless (no text/logos/people), matched to brand colors/mood. If a generation errors or exceeds ~6 minutes of polling, fall back to gradient treatment and note it in SCRIPT.md.
- **Voiceover**: ELEVENLABS_API_KEY is set and funded — PREFER ElevenLabs for narration (per-scene mp3s via the API; pick the voice to match the film's mood). Fallbacks in order: GEMINI_API_KEY (rate-limited), then local \`npx hyperframes tts "line" -o vo.wav -v af_heart\` (voices: af_heart, af_nova, am_adam, am_michael, bm_george — always works).
- **ffmpeg / ffprobe** for any assembly or probing.

## Quality bar (check before declaring done)
1. First 5 seconds make a concrete promise or expose a concrete pain.
2. Every product claim is supported by the captured site copy.
3. Real product UI appears prominently (screenshots with motion — pan/zoom in framed cards).
4. Reference structure recognizable; zero reused reference content.
5. On-screen text readable without sound; nothing overlaps or clips.
6. CTA shows the correct product name and domain.
7. \`ffprobe launchreel.mp4\` shows video + audio streams and 28-45s duration.
8. If LUMENFALL_API_KEY is set: \`ai-shots/shot-1.mp4\` exists AND is referenced by the composition's index.html (the hook plays it).

Work autonomously. Do not ask questions. Finish only when launchreel.mp4 passes the checklist.`;
}

/**
 * DIRECTOR_MODE=full — Hermes produces the film end-to-end with its own tool
 * calls (HyperFrames, Lumenfall, TTS). Returns the MP4 path, or null so the
 * caller can fall back to the plan-mode pipeline.
 */
export async function hermesProduce(
  inputs: ProduceInputs,
  exec: (command: string, args: string[], timeoutMs?: number, cwd?: string) => Promise<{ stdout: string; stderr: string }>,
  log: (message: string) => void,
): Promise<string | null> {
  const { writeFile, stat } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const brief = productionBrief(inputs);
  await writeFile(join(inputs.attemptDir, "PRODUCTION.md"), brief);
  const override = process.env.DIRECTOR_CMD?.trim().split(/\s+/);
  const prompt = "Read PRODUCTION.md in the current directory and execute it completely. Produce launchreel.mp4 here. Work autonomously until the output contract and quality bar are met.";
  const candidates: string[][] = override?.length
    ? [[...override, prompt]]
    : [["hermes", "-z", prompt, "--yolo"], ["claude", "-p", prompt, "--dangerously-skip-permissions"]];
  for (const [command, ...args] of candidates) {
    if (!command) continue;
    try {
      log(`Hermes producer (${command}) is making the film end-to-end`);
      await exec(command, args, 25 * 60_000, inputs.attemptDir);
      const output = join(inputs.attemptDir, "launchreel.mp4");
      const info = await stat(output);
      if (info.size < 100_000) throw new Error("Output MP4 is implausibly small");
      log(`Hermes producer delivered launchreel.mp4 (${(info.size / 1e6).toFixed(1)} MB)`);
      return output;
    } catch (error) {
      log(`Producer ${command} did not deliver (${error instanceof Error ? error.message.slice(0, 200) : error})`);
    }
  }
  return null;
}

/**
 * Hermes is the creative director. DIRECTOR_CMD overrides the runtime
 * (e.g. "claude -p"); DIRECTOR=off disables direction entirely and the
 * deterministic storyboard takes over.
 */
export async function directCreativePlan(
  inputs: DirectorInputs,
  exec: Exec,
  log: (message: string) => void,
): Promise<CreativePlan | null> {
  if ((process.env.DIRECTOR ?? "on").toLowerCase() === "off") return null;
  const prompt = buildDirectorPrompt(inputs);
  const override = process.env.DIRECTOR_CMD?.trim().split(/\s+/);
  const candidates: string[][] = override?.length
    ? [[...override, prompt]]
    : [["hermes", "-z", prompt], ["claude", "-p", prompt]];
  for (const [command, ...args] of candidates) {
    if (!command) continue;
    try {
      log(`Director (${command}) is planning the film`);
      const { stdout } = await exec(command, args, 5 * 60_000);
      const plan = validatePlan(extractJson(stdout));
      log(`Director locked the concept: ${plan.concept}`);
      return plan;
    } catch (error) {
      log(`Director ${command} failed (${error instanceof Error ? error.message.slice(0, 200) : error})`);
    }
  }
  log("All director runtimes failed; using the deterministic storyboard");
  return null;
}
