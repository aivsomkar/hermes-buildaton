import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

export interface BrandColors {
  base: string;
  surface: string;
  accent: string;
  foreground: string;
}

export interface ProductResearch {
  title: string;
  headline: string;
  tagline: string;
  summary: string;
  features: string[];
  colors: BrandColors;
  fonts: string[];
  screenshots: string[];
  context?: string;
  captureDir: string;
}

interface CaptureTokens {
  title?: string;
  description?: string;
  colors?: string[];
  fonts?: Array<{ family?: string }>;
  headings?: Array<{ level: number; text: string; fontSize?: string; color?: string }>;
}

type Exec = (command: string, args: string[], timeoutMs?: number) => Promise<{ stdout: string; stderr: string }>;

function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match || !match[1]) return null;
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function luma([r, g, b]: [number, number, number]): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function saturation([r, g, b]: [number, number, number]): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

/** Pick a dark base, a light surface, and the most saturated mid-luma color as accent. */
export function pickBrandColors(hexes: string[]): BrandColors {
  const parsed = hexes
    .map((hex) => ({ hex: hex.toLowerCase(), rgb: hexToRgb(hex) }))
    .filter((entry): entry is { hex: string; rgb: [number, number, number] } => entry.rgb !== null);
  const darks = parsed.filter((c) => luma(c.rgb) < 70);
  const lights = parsed.filter((c) => luma(c.rgb) > 215);
  const vivid = parsed
    .filter((c) => saturation(c.rgb) > 0.35 && luma(c.rgb) > 40 && luma(c.rgb) < 210)
    .sort((a, b) => saturation(b.rgb) - saturation(a.rgb));
  const base = darks[0]?.hex ?? "#15130f";
  const surface = lights[0]?.hex ?? "#f7f2e8";
  const accent = vivid[0]?.hex ?? "#ef5b35";
  const foreground = luma(hexToRgb(base) ?? [0, 0, 0]) < 128 ? surface : "#111111";
  return { base, surface, accent, foreground };
}

function cleanLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function extractFeatures(headings: CaptureTokens["headings"], visibleSpans: string[]): string[] {
  const candidates: string[] = [];
  for (const heading of headings ?? []) {
    if (heading.level >= 2 && heading.level <= 3) candidates.push(cleanLine(heading.text));
  }
  candidates.push(...visibleSpans.map(cleanLine));
  const blocked = /^(faq|pricing|blog|about|contact|login|sign|terms|privacy|careers|docs|documentation|resources|company|menu|home|features)$/i;
  const seen = new Set<string>();
  const features: string[] = [];
  for (const candidate of candidates) {
    const words = candidate.split(" ").length;
    if (candidate.length < 8 || candidate.length > 64 || words < 2 || words > 9) continue;
    if (blocked.test(candidate) || /[|@©{}<>]/.test(candidate)) continue;
    const key = candidate.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    features.push(candidate);
    if (features.length >= 6) break;
  }
  return features;
}

async function linkupContext(url: string): Promise<string | undefined> {
  const apiKey = process.env.LINKUP_API_KEY?.trim();
  if (!apiKey) return undefined;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);
    const response = await fetch("https://api.linkup.so/v1/search", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        q: `What does the company at ${url} do? Product, mission or philosophy, and target customers, in 4 sentences.`,
        depth: "standard",
        outputType: "sourcedAnswer",
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!response.ok) return undefined;
    const data = (await response.json()) as { answer?: string };
    return data.answer?.slice(0, 1200);
  } catch {
    return undefined;
  }
}

/**
 * Researcher stage: capture the product site with HyperFrames (screenshots, design
 * tokens, visible copy), then distill it into the brief the crew works from.
 */
export async function captureProduct(url: string, outDir: string, exec: Exec): Promise<ProductResearch> {
  const captureDir = join(outDir, "capture");
  const contextPromise = linkupContext(url);
  await exec("npx", [
    "hyperframes", "capture", url,
    "-o", captureDir,
    "--json",
    "--max-screenshots", "8",
    "--timeout", "90000",
  ], 180_000);

  let tokens: CaptureTokens = {};
  try {
    tokens = JSON.parse(await readFile(join(captureDir, "extracted/tokens.json"), "utf8")) as CaptureTokens;
  } catch {
    // Tokens are an enhancement; screenshots alone still carry the video.
  }
  let visibleSpans: string[] = [];
  try {
    const visible = await readFile(join(captureDir, "extracted/visible-text.txt"), "utf8");
    visibleSpans = visible
      .split("\n")
      .map((line) => /^\[(span|p|li)\]\s*(.+)$/.exec(line)?.[2] ?? "")
      .filter(Boolean);
  } catch {
    // Same: optional.
  }

  const shots = (await readdir(join(captureDir, "screenshots")).catch(() => []))
    .filter((file) => file.startsWith("scroll-") && file.endsWith(".png"))
    .sort();
  const pick = (ratio: number) => shots[Math.min(shots.length - 1, Math.round(ratio * (shots.length - 1)))];
  const screenshots = [...new Set([pick(0), pick(0.4), pick(0.8)])]
    .filter((file): file is string => Boolean(file))
    .map((file) => join(captureDir, "screenshots", file));
  if (screenshots.length === 0) throw new Error("Product capture produced no screenshots");

  const rawTitle = tokens.title ?? new URL(url).hostname.replace(/^www\./, "");
  const title = cleanLine(rawTitle.split(/[|–—·:]/)[0] ?? rawTitle).slice(0, 60) || "Your product";
  const taglineFromTitle = cleanLine(rawTitle.split(/[|–—·]/).slice(1).join(" "));
  const h1 = tokens.headings?.find((heading) => heading.level === 1)?.text;
  const headline = cleanLine(h1 ?? taglineFromTitle ?? title).slice(0, 90) || title;
  const tagline = cleanLine(tokens.description ?? taglineFromTitle ?? "").slice(0, 160);

  return {
    title,
    headline,
    tagline,
    summary: tagline || `${title} — captured from ${url}`,
    features: extractFeatures(tokens.headings, visibleSpans),
    colors: pickBrandColors(tokens.colors ?? []),
    fonts: (tokens.fonts ?? []).map((font) => font.family ?? "").filter(Boolean).slice(0, 4),
    screenshots,
    context: await contextPromise,
    captureDir,
  };
}
