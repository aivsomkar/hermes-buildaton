import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { ProductResearch } from "./capture.js";
import type { HookClip } from "./generate.js";
import type { JobFormat } from "./types.js";

type Exec = (command: string, args: string[], timeoutMs?: number) => Promise<{ stdout: string; stderr: string }>;

export interface ReferenceBeats {
  meta?: { duration?: number };
  arc?: string;
  vo_mode?: string;
  pacing?: { cuts_per_sec_by_third?: number[] };
}

export interface ScenePlan {
  id: string;
  kind: "hook" | "promise" | "ui" | "stack" | "cta";
  minSeconds: number;
  seconds: number;
  voLine: string;
  title?: string;
  sub?: string;
  caption?: string;
  screenshot?: string;
  voFile?: string;
  voDuration?: number;
}

export interface Storyboard {
  scenes: ScenePlan[];
  styleNotes: string;
  fast: boolean;
}

const sentence = (text: string) => {
  const clean = text.replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "");
  return clean ? `${clean}.` : "";
};

export function buildStoryboard(research: ProductResearch, beats: ReferenceBeats, format: JobFormat): Storyboard {
  const cuts = beats.pacing?.cuts_per_sec_by_third ?? [];
  const avgCuts = cuts.length ? cuts.reduce((a, b) => a + b, 0) / cuts.length : 0.3;
  const fast = avgCuts > 0.45 || (beats.meta?.duration ?? 40) < 25;
  const pace = fast ? 0.85 : 1;
  const domain = research.captureDir ? "" : "";
  void domain;

  const features = research.features.length
    ? research.features
    : ["Built for real work", "Fast to set up", "Loved by teams"];
  const shots = research.screenshots;
  const scenes: ScenePlan[] = [];

  scenes.push({
    id: "hook", kind: "hook", minSeconds: 4.4 * pace, seconds: 0,
    voLine: sentence(research.headline || `Meet ${research.title}`),
    title: research.headline || research.title,
  });
  scenes.push({
    id: "promise", kind: "promise", minSeconds: 3.8 * pace, seconds: 0,
    voLine: sentence(research.tagline || research.summary),
    title: research.tagline || research.summary,
  });
  const uiCount = Math.min(3, shots.length);
  for (let index = 0; index < uiCount; index += 1) {
    const feature = features[index % features.length] ?? "";
    scenes.push({
      id: `ui${index + 1}`, kind: "ui", minSeconds: (index === 0 ? 5 : 4.6) * pace, seconds: 0,
      voLine: sentence(feature),
      caption: feature,
      screenshot: shots[index],
    });
  }
  scenes.push({
    id: "stack", kind: "stack", minSeconds: 4.4 * pace, seconds: 0,
    voLine: sentence(`From ${features[0]?.toLowerCase() ?? "day one"} to ${features[1]?.toLowerCase() ?? "launch day"} — ${research.title} ships it all`),
    title: "Everything you need",
    sub: features.slice(0, 3).join(" · "),
  });
  scenes.push({
    id: "cta", kind: "cta", minSeconds: 4.6 * pace, seconds: 0,
    voLine: sentence(`${research.title}. Launch it today`),
    title: research.title,
  });

  const styleNotes = [
    `Reference arc: ${beats.arc ?? "unknown"}; vo mode: ${beats.vo_mode ?? "unknown"}.`,
    `Average cuts/sec ${avgCuts.toFixed(2)} → ${fast ? "fast" : "steady"} pacing (${pace}x scene lengths).`,
    `Format ${format}. Brand base ${research.colors.base}, accent ${research.colors.accent}.`,
  ].join("\n");

  return { scenes, styleNotes, fast };
}

export interface VoicePick {
  kokoro: string;
  elevenLabs: string;
  gemini: string;
  reason: string;
}

/**
 * Match narrator to the video's mood, derived from the reference style brief
 * and the product story. Env vars still win when the client insists on a voice.
 */
export function pickVoice(styleText: string, fast: boolean): VoicePick {
  const style = styleText.toLowerCase();
  if (/(hype|energetic|bold|loud|social|punchy)/.test(style) || fast) {
    return { kokoro: "am_adam", elevenLabs: "TxGEqnHWrfWFTfGW9XjX", gemini: "Puck", reason: "fast-cut energetic reference → driven male narrator" };
  }
  if (/(cinematic|premium|dramatic|epic|filmic|luxury)/.test(style)) {
    return { kokoro: "bm_george", elevenLabs: "pNInz6obpgDQGcFmaJgB", gemini: "Charon", reason: "cinematic reference → deep gravitas narrator" };
  }
  if (/(developer|technical|infra|api|backend|engineer)/.test(style)) {
    return { kokoro: "am_michael", elevenLabs: "ErXwobaYiN019PkySvjV", gemini: "Orus", reason: "technical product → clear even narrator" };
  }
  if (/(warm|friendly|community|human|calm|wellness)/.test(style)) {
    return { kokoro: "af_heart", elevenLabs: "21m00Tcm4TlvDq8ikWAM", gemini: "Aoede", reason: "warm reference → warm female narrator" };
  }
  return { kokoro: "af_nova", elevenLabs: "21m00Tcm4TlvDq8ikWAM", gemini: "Kore", reason: "default confident product narrator" };
}

async function geminiTts(text: string, file: string, voiceName: string, exec: Exec): Promise<boolean> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return false;
  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent",
    {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Narrate warmly and confidently, launch-film pace: ${text}` }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
        },
      }),
    },
  );
  if (!response.ok) throw new Error(`Gemini TTS failed (${response.status})`);
  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string } }> } }>;
  };
  const base64 = data.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data)?.inlineData?.data;
  if (!base64) throw new Error("Gemini TTS returned no audio");
  const pcm = `${file}.pcm`;
  await writeFile(pcm, Buffer.from(base64, "base64"));
  await exec("ffmpeg", ["-y", "-v", "error", "-f", "s16le", "-ar", "24000", "-ac", "1", "-i", pcm, file], 60_000);
  return true;
}

async function elevenLabsTts(text: string, file: string, voiceId: string): Promise<boolean> {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) return false;
  const voice = process.env.ELEVENLABS_VOICE_ID?.trim() || voiceId;
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.25 },
    }),
  });
  if (!response.ok) throw new Error(`ElevenLabs TTS failed (${response.status})`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(file, buffer);
  return true;
}

async function probeDuration(file: string, exec: Exec): Promise<number> {
  const { stdout } = await exec("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file,
  ], 30_000);
  const duration = Number(stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) throw new Error(`Could not probe ${file}`);
  return duration;
}

/** Synthesize per-scene narration (ElevenLabs when configured, local Kokoro otherwise). */
export async function synthesizeVoiceover(
  scenes: ScenePlan[],
  assetsDir: string,
  exec: Exec,
  log: (message: string) => void,
  voice?: VoicePick,
): Promise<void> {
  const narrator = voice ?? pickVoice("", false);
  log(`Narrator: ${narrator.reason}`);
  for (const scene of scenes) {
    if (!scene.voLine) continue;
    try {
      const mp3 = join(assetsDir, `vo-${scene.id}.mp3`);
      const wav = join(assetsDir, `vo-${scene.id}.wav`);
      if (await elevenLabsTts(scene.voLine, mp3, narrator.elevenLabs).catch((error) => { log(String(error)); return false; })) {
        scene.voFile = mp3;
      } else if (await geminiTts(scene.voLine, wav, narrator.gemini, exec).catch((error) => { log(String(error)); return false; })) {
        scene.voFile = wav;
      } else {
        await exec("npx", ["hyperframes", "tts", scene.voLine, "-o", wav, "-v", narrator.kokoro], 120_000);
        scene.voFile = wav;
      }
      scene.voDuration = await probeDuration(scene.voFile, exec);
    } catch (error) {
      log(`Voiceover for ${scene.id} failed (${error instanceof Error ? error.message : error}); scene stays music-free`);
      scene.voFile = undefined;
    }
  }
}

/** Lock final timings: a scene never cuts before its narration finishes. */
export function lockTimings(scenes: ScenePlan[], hook?: HookClip | null): number {
  let total = 0;
  for (const scene of scenes) {
    let seconds = Math.max(scene.minSeconds, (scene.voDuration ?? 0) + 0.7);
    if (scene.kind === "hook" && hook) seconds = Math.max(seconds, hook.seconds);
    scene.seconds = Math.round(seconds * 10) / 10;
    total += scene.seconds;
  }
  return Math.round(total * 10) / 10;
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const wordSpans = (text: string) =>
  text.split(/\s+/).filter(Boolean)
    .map((word) => `<span class="wm"><span class="w">${escapeHtml(word)}</span></span>`)
    .join(" ");

export interface CompositionInput {
  research: ProductResearch;
  scenes: ScenePlan[];
  format: JobFormat;
  hook?: HookClip | null;
  productUrl: string;
}

export function compositionHtml(input: CompositionInput): string {
  const { research, scenes, format, hook, productUrl } = input;
  const W = format === "portrait" ? 1080 : 1920;
  const H = format === "portrait" ? 1920 : 1080;
  const { base, surface, accent, foreground } = research.colors;
  const total = scenes.reduce((sum, scene) => sum + scene.seconds, 0);
  const display = Math.round(W * (format === "portrait" ? 0.088 : 0.062));
  const body = Math.round(W * (format === "portrait" ? 0.042 : 0.026));
  const domain = new URL(productUrl).hostname.replace(/^www\./, "");

  let cursor = 0;
  const starts = new Map<string, number>();
  for (const scene of scenes) {
    starts.set(scene.id, Math.round(cursor * 100) / 100);
    cursor += scene.seconds;
  }

  const sceneDiv = (scene: ScenePlan): string => {
    const start = starts.get(scene.id) ?? 0;
    const common = `class="clip scene" data-start="${start}" data-duration="${scene.seconds}" data-track-index="1"`;
    if (scene.kind === "hook") {
      return `<div id="s-${scene.id}" ${common} style="z-index:2;${hook ? "background:transparent" : `background:radial-gradient(120% 140% at 20% 10%, ${accent}33, transparent 55%), linear-gradient(160deg, ${base}, ${base})`}">
        ${hook ? `<div class="scrim"></div>` : `<div class="glow" id="g-${scene.id}"></div>`}
        <div class="center pad">
          <div class="kicker" id="k-${scene.id}">${escapeHtml(domain.toUpperCase())} · LAUNCH FILM</div>
          <h1 class="display" id="h-${scene.id}">${wordSpans(scene.title ?? "")}</h1>
        </div>
      </div>`;
    }
    if (scene.kind === "promise") {
      return `<div id="s-${scene.id}" ${common} style="z-index:2;background:${surface}">
        <div class="center pad">
          <div class="rule" id="r-${scene.id}"></div>
          <h2 class="display dark" id="h-${scene.id}" style="font-size:${Math.round(display * 0.78)}px">${escapeHtml(scene.title ?? "")}</h2>
        </div>
      </div>`;
    }
    if (scene.kind === "ui") {
      return `<div id="s-${scene.id}" ${common} style="z-index:2;background:radial-gradient(100% 120% at 80% 0%, ${accent}22, transparent 50%), ${base}">
        <div class="browser" id="b-${scene.id}">
          <div class="chrome"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="urlpill">${escapeHtml(domain)}</span></div>
          <div class="shotwrap"><img id="img-${scene.id}" src="assets/${escapeHtml(basename(scene.screenshot ?? ""))}" alt=""/></div>
        </div>
        ${scene.caption ? `<div class="chip" id="c-${scene.id}"><span class="bar"></span>${escapeHtml(scene.caption)}</div>` : ""}
      </div>`;
    }
    if (scene.kind === "stack") {
      const rows = (scene.sub ?? "").split(" · ").map((feature, index) =>
        `<div class="row" id="row-${index}-${scene.id}"><span class="num">0${index + 1}</span><span class="rowtext">${escapeHtml(feature)}</span></div>`).join("");
      return `<div id="s-${scene.id}" ${common} style="z-index:2;background:${base}">
        <div class="center pad">
          <div class="kicker">${escapeHtml((scene.title ?? "").toUpperCase())}</div>
          <div class="rows">${rows}</div>
        </div>
      </div>`;
    }
    return `<div id="s-${scene.id}" ${common} style="z-index:2;background:radial-gradient(120% 140% at 50% 110%, ${accent}44, transparent 60%), ${base}">
      <div class="center pad">
        <h2 class="display" id="h-${scene.id}">${escapeHtml(scene.title ?? "")}</h2>
        <div class="ctapill" id="p-${scene.id}">${escapeHtml(domain)}</div>
        <div class="credit">made with LaunchReel</div>
      </div>
    </div>`;
  };

  const media: string[] = [];
  if (hook) {
    media.push(`<video id="hookclip" class="clip" src="assets/${escapeHtml(basename(hook.file))}" data-start="0" data-duration="${Math.min(hook.seconds, scenes[0]?.seconds ?? hook.seconds)}" data-track-index="0" muted playsinline style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1"></video>`);
  }
  let audioTrack = 20;
  for (const scene of scenes) {
    if (!scene.voFile || !scene.voDuration) continue;
    media.push(`<audio id="vo-${scene.id}" src="assets/${escapeHtml(basename(scene.voFile))}" data-start="${(starts.get(scene.id) ?? 0) + 0.25}" data-duration="${scene.voDuration}" data-track-index="${audioTrack}" data-volume="1"></audio>`);
    audioTrack += 1;
  }

  const timeline: string[] = [];
  for (const scene of scenes) {
    const start = starts.get(scene.id) ?? 0;
    const end = start + scene.seconds;
    const isLast = scene === scenes[scenes.length - 1];
    if (scene.kind === "hook") {
      timeline.push(`tl.fromTo("#k-${scene.id}", {opacity:0, y:18}, {opacity:1, y:0, duration:0.5, ease:"power3.out"}, ${start + 0.2});`);
      timeline.push(`tl.fromTo("#h-${scene.id} .w", {yPercent:115}, {yPercent:0, duration:0.7, stagger:0.07, ease:"power4.out"}, ${start + 0.35});`);
      if (!hook) timeline.push(`tl.fromTo("#g-${scene.id}", {scale:0.8, opacity:0.4}, {scale:1.25, opacity:0.9, duration:${scene.seconds}, ease:"sine.inOut"}, ${start});`);
    } else if (scene.kind === "promise") {
      timeline.push(`tl.fromTo("#r-${scene.id}", {scaleX:0}, {scaleX:1, duration:0.6, ease:"power3.inOut"}, ${start + 0.15});`);
      timeline.push(`tl.fromTo("#h-${scene.id}", {opacity:0, y:26}, {opacity:1, y:0, duration:0.7, ease:"power3.out"}, ${start + 0.3});`);
    } else if (scene.kind === "ui") {
      timeline.push(`tl.fromTo("#b-${scene.id}", {opacity:0, y:44, scale:0.965}, {opacity:1, y:0, scale:1, duration:0.75, ease:"power3.out"}, ${start + 0.1});`);
      timeline.push(`tl.fromTo("#img-${scene.id}", {scale:1.04, yPercent:0}, {scale:1.16, yPercent:-5, duration:${scene.seconds}, ease:"none"}, ${start});`);
      timeline.push(`tl.fromTo("#c-${scene.id}", {opacity:0, x:-28}, {opacity:1, x:0, duration:0.55, ease:"power3.out"}, ${start + 0.55});`);
    } else if (scene.kind === "stack") {
      timeline.push(`tl.fromTo("#s-${scene.id} .row", {opacity:0, x:-40}, {opacity:1, x:0, duration:0.6, stagger:0.14, ease:"power3.out"}, ${start + 0.25});`);
    } else {
      timeline.push(`tl.fromTo("#h-${scene.id}", {opacity:0, scale:0.94}, {opacity:1, scale:1, duration:0.7, ease:"power3.out"}, ${start + 0.15});`);
      timeline.push(`tl.fromTo("#p-${scene.id}", {opacity:0, y:24}, {opacity:1, y:0, duration:0.6, ease:"back.out(1.6)"}, ${start + 0.6});`);
    }
    timeline.push(`tl.fromTo("#s-${scene.id}", {opacity:${scene.kind === "hook" && hook ? 1 : 0}}, {opacity:1, duration:0.45, ease:"power2.out"}, ${start});`);
    if (!isLast) timeline.push(`tl.to("#s-${scene.id}", {opacity:0, duration:0.4, ease:"power2.in"}, ${end - 0.4});`);
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=${W}, height=${H}"/>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${W}px;height:${H}px;overflow:hidden;background:${base}}
  body{font-family:-apple-system,"Inter","Helvetica Neue",Arial,sans-serif;color:${foreground}}
  .scene{position:absolute;inset:0;overflow:hidden}
  .center{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;gap:${Math.round(H * 0.03)}px}
  .pad{padding:0 ${Math.round(W * 0.09)}px}
  .display{font-size:${display}px;line-height:1.04;font-weight:800;letter-spacing:-0.025em;color:${foreground};max-width:${Math.round(W * 0.84)}px}
  .display.dark{color:#151515}
  .kicker{font-size:${Math.round(body * 0.72)}px;font-weight:700;letter-spacing:0.22em;color:${accent}}
  .wm{display:inline-block;overflow:hidden;vertical-align:bottom}
  .w{display:inline-block;will-change:transform}
  .scrim{position:absolute;inset:0;background:linear-gradient(180deg,${base}00 30%,${base}e6 100%);z-index:0}
  .glow{position:absolute;width:${Math.round(W * 0.62)}px;height:${Math.round(W * 0.62)}px;border-radius:50%;right:-${Math.round(W * 0.16)}px;top:-${Math.round(W * 0.18)}px;background:radial-gradient(circle,${accent}55,transparent 65%)}
  .rule{width:${Math.round(W * 0.09)}px;height:${Math.max(6, Math.round(H * 0.008))}px;background:${accent};transform-origin:left center}
  .browser{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:${format === "portrait" ? "92%" : "76%"};border-radius:${Math.round(W * 0.012)}px;overflow:hidden;box-shadow:0 ${Math.round(H * 0.04)}px ${Math.round(H * 0.1)}px rgba(0,0,0,0.5);background:#101010}
  .chrome{display:flex;align-items:center;gap:10px;padding:${Math.round(H * 0.012)}px ${Math.round(W * 0.014)}px;background:#1d1d1f}
  .dot{width:${Math.round(W * 0.007)}px;height:${Math.round(W * 0.007)}px;border-radius:50%;background:#4a4a4e}
  .urlpill{margin-left:${Math.round(W * 0.01)}px;font-size:${Math.round(body * 0.6)}px;color:#9a9aa0;background:#2a2a2e;border-radius:999px;padding:${Math.round(H * 0.005)}px ${Math.round(W * 0.012)}px}
  .shotwrap{width:100%;aspect-ratio:${format === "portrait" ? "4/5" : "16/9.6"};overflow:hidden;background:#0c0c0c}
  .shotwrap img{width:100%;display:block;will-change:transform}
  .chip{position:absolute;left:${Math.round(W * 0.06)}px;bottom:${Math.round(H * 0.07)}px;display:flex;align-items:center;gap:${Math.round(W * 0.012)}px;font-size:${Math.round(body * 1.05)}px;font-weight:700;color:#fff;background:rgba(12,12,14,0.78);border-radius:${Math.round(W * 0.008)}px;padding:${Math.round(H * 0.016)}px ${Math.round(W * 0.02)}px;backdrop-filter:blur(6px)}
  .chip .bar{width:${Math.round(W * 0.004)}px;align-self:stretch;background:${accent};border-radius:2px}
  .rows{display:flex;flex-direction:column;gap:${Math.round(H * 0.028)}px;margin-top:${Math.round(H * 0.01)}px}
  .row{display:flex;align-items:center;gap:${Math.round(W * 0.024)}px;font-size:${Math.round(display * 0.6)}px;font-weight:800;letter-spacing:-0.02em}
  .num{font-size:${Math.round(body * 0.9)}px;font-weight:700;color:${accent};letter-spacing:0.08em}
  .ctapill{font-size:${Math.round(body * 1.25)}px;font-weight:800;color:${base};background:${accent};border-radius:999px;padding:${Math.round(H * 0.018)}px ${Math.round(W * 0.032)}px}
  .credit{position:absolute;bottom:${Math.round(H * 0.045)}px;left:0;right:0;text-align:center;font-size:${Math.round(body * 0.62)}px;color:${foreground}66;letter-spacing:0.12em}
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${Math.round(total * 10) / 10}" data-width="${W}" data-height="${H}" data-fps="30" style="position:relative;width:${W}px;height:${H}px;overflow:hidden;background:${base}">
${media.join("\n")}
${scenes.map(sceneDiv).join("\n")}
</div>
<script>
window.__timelines = window.__timelines || {};
const tl = gsap.timeline({ paused: true });
${timeline.join("\n")}
window.__timelines["main"] = tl;
</script>
</body>
</html>
`;
}

export function scriptMarkdown(input: CompositionInput, styleNotes: string): string {
  let cursor = 0;
  const rows = input.scenes.map((scene) => {
    const row = `| ${cursor.toFixed(1)}–${(cursor + scene.seconds).toFixed(1)}s | ${scene.kind} | ${scene.voLine || "—"} | ${scene.title ?? scene.caption ?? "—"} |`;
    cursor += scene.seconds;
    return row;
  });
  return `# ${input.research.title} — launch film script\n\nProduct: ${input.productUrl}\n\n${input.research.context ? `## Company context\n\n${input.research.context}\n\n` : ""}## Style notes\n\n${styleNotes}\n\n## Timeline\n\n| Time | Scene | Voiceover | On screen |\n|---|---|---|---|\n${rows.join("\n")}\n`;
}

/** Assemble the HyperFrames project on disk and render the MP4. */
export async function renderComposition(
  input: CompositionInput,
  projectDir: string,
  outputFile: string,
  exec: Exec,
): Promise<void> {
  const assets = join(projectDir, "assets");
  await mkdir(assets, { recursive: true });
  for (const scene of input.scenes) {
    if (scene.screenshot) await copyFile(scene.screenshot, join(assets, basename(scene.screenshot)));
    if (scene.voFile) await copyFile(scene.voFile, join(assets, basename(scene.voFile)));
  }
  if (input.hook) await copyFile(input.hook.file, join(assets, basename(input.hook.file)));
  await writeFile(join(projectDir, "index.html"), compositionHtml(input));
  await exec("npx", ["hyperframes", "render", projectDir, "-o", outputFile, "--quality", "standard", "--skill", "product-launch-video", "--quiet"], 12 * 60_000);
}
