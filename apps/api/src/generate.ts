import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { LumenfallClient, LumenfallError, type LumenfallVideoRequest } from "./lumenfall.js";
import type { JobFormat } from "./types.js";

export interface HookBrief {
  productTitle: string;
  productSummary: string;
  styleText: string;
  format: JobFormat;
  baseColor: string;
  accentColor: string;
  imageUrl?: string;
}

export interface HookClip {
  file: string;
  model: string;
  seconds: number;
  costUsd?: number;
}

const MODEL_SECONDS: Record<string, number> = {
  "kling-v3": 5,
  "veo-3.1-fast": 4,
  "veo-3.1-lite": 4,
  "sora-2": 4,
  "pixverse-v5.6": 5,
  "wan-2.6": 5,
  "grok-imagine-video": 6,
  "p-video": 5,
};

const MAX_HOOK_COST_USD = 2.5;

/**
 * Choose the generation model that best fits this video, most-preferred first.
 * The chain degrades toward cheaper models so a provider rejection never kills the job.
 */
export function pickModelChain(brief: HookBrief): string[] {
  const forced = (process.env.LUMENFALL_MODEL ?? "auto").trim();
  const style = brief.styleText.toLowerCase();
  const chain: string[] = [];
  const add = (model: string) => {
    if (model in MODEL_SECONDS && !chain.includes(model)) chain.push(model);
  };

  if (forced && forced !== "auto") add(forced);
  if (brief.imageUrl) add("kling-v3");
  if (/(energetic|fast|hype|social|meme|punchy)/.test(style)) {
    add("pixverse-v5.6");
    add("grok-imagine-video");
  }
  if (/(cinematic|premium|dramatic|filmic|epic)/.test(style)) add("veo-3.1-fast");
  if (/(realistic|human|founder|talking|testimonial)/.test(style)) add("sora-2");
  add("veo-3.1-fast");
  add("veo-3.1-lite");
  add("p-video");
  return chain;
}

/**
 * The AI clip is a wordless cinematic opener; all text is composited by HyperFrames
 * so typography stays crisp and on-brand.
 */
export function hookPrompt(brief: HookBrief): string {
  const orientation = brief.format === "portrait" ? "vertical 9:16" : "widescreen 16:9";
  if (brief.imageUrl) {
    return [
      `Cinematic ${orientation} product-launch opener animating this software interface.`,
      "Slow confident push-in toward the interface, subtle parallax depth, soft volumetric light sweep,",
      `ambient particles in ${brief.accentColor} against ${brief.baseColor} tones.`,
      "Premium tech-launch mood, smooth motion, shallow depth of field.",
      "No on-screen text, no captions, no logos, no people.",
    ].join(" ");
  }
  return [
    `Cinematic ${orientation} abstract opener for a software product launch: ${brief.productTitle}.`,
    brief.productSummary ? `The product: ${brief.productSummary.slice(0, 220)}.` : "",
    `Abstract premium motion design — flowing light ribbons and glass panels in ${brief.accentColor} over deep ${brief.baseColor},`,
    "slow camera drift, depth of field, high-end launch-film energy.",
    "Strictly no on-screen text, no words, no letters, no logos, no watermarks, no people.",
  ].filter(Boolean).join(" ");
}

export async function generateHookClip(
  brief: HookBrief,
  targetFile: string,
  log: (message: string) => void,
): Promise<HookClip | null> {
  const apiKey = process.env.LUMENFALL_API_KEY?.trim();
  if (!apiKey) {
    log("Lumenfall disabled (no LUMENFALL_API_KEY); the hook stays graphic-only");
    return null;
  }
  const client = new LumenfallClient({ apiKey });
  const prompt = hookPrompt(brief);
  for (const model of pickModelChain(brief)) {
    const seconds = MODEL_SECONDS[model] ?? 5;
    const request: LumenfallVideoRequest = {
      model,
      prompt,
      seconds: String(seconds),
      aspect_ratio: brief.format === "portrait" ? "9:16" : "16:9",
      metadata: { source: "launchreel", scene: "hook" },
    };
    if (brief.imageUrl && model === "kling-v3") request.input_reference = { image_url: brief.imageUrl };
    try {
      let costUsd: number | undefined;
      try {
        const estimate = await client.estimateVideo(request);
        costUsd = estimate.total_cost_micros / 1_000_000;
        if (costUsd > MAX_HOOK_COST_USD) {
          log(`Skipping ${model}: estimated $${costUsd.toFixed(2)} exceeds the $${MAX_HOOK_COST_USD} hook budget`);
          continue;
        }
      } catch {
        // Estimation is best-effort; generation still enforces provider-side limits.
      }
      log(`Generating hook b-roll with ${model} (${seconds}s${costUsd ? `, ~$${costUsd.toFixed(2)}` : ""})`);
      const created = await client.createVideo(request);
      const video = await client.waitForVideo(created.id, { timeoutMs: 6 * 60_000, pollMs: 5_000 });
      const url = video.output?.url;
      if (!url) throw new LumenfallError("Missing output URL", "missing_output");
      const response = await fetch(url);
      if (!response.ok || !response.body) throw new LumenfallError(`Download failed (${response.status})`);
      await pipeline(Readable.fromWeb(response.body as import("node:stream/web").ReadableStream), createWriteStream(targetFile));
      log(`Hook clip ready via ${model}`);
      return { file: targetFile, model, seconds, costUsd };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`Model ${model} unavailable (${message}); trying the next candidate`);
    }
  }
  log("All Lumenfall candidates failed; the hook stays graphic-only");
  return null;
}
