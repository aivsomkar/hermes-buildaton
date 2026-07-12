import { isIP } from "node:net";
import { relative, resolve } from "node:path";
import type { CreateJobInput, JobFormat, LaunchJob } from "./types.js";

export class ValidationError extends Error {}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a = 0, b = 0] = parts;
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}

export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (isIP(host) === 4) return isPrivateIpv4(host);
  if (isIP(host) === 6) {
    return host === "::1" || host === "::" || host.startsWith("fc") || host.startsWith("fd") ||
      host.startsWith("fe8") || host.startsWith("fe9") || host.startsWith("fea") || host.startsWith("feb") ||
      host.startsWith("::ffff:127.") || host.startsWith("::ffff:10.") || host.startsWith("::ffff:192.168.");
  }
  return false;
}

export function normalizeUrl(value: string, field: string): string {
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("protocol");
    if (url.username || url.password) throw new Error("credentials");
    if (isBlockedHostname(url.hostname)) throw new Error("private host");
    if (url.port && !["80", "443"].includes(url.port)) throw new Error("port");
    return url.toString();
  } catch {
    throw new ValidationError(`${field} must be a public http(s) URL`);
  }
}

function validateUploadPath(value: string, uploadRoot?: string): string {
  if (!uploadRoot) throw new ValidationError("Upload the inspiration video instead of supplying a server file path");
  const root = resolve(uploadRoot);
  const candidate = resolve(value);
  const rel = relative(root, candidate);
  if (!rel || rel.startsWith("..") || rel.includes("/../") || rel.includes("\\..\\")) {
    throw new ValidationError("Uploaded video path is outside the private upload directory");
  }
  return candidate;
}

export function validateCreateInput(raw: Partial<CreateJobInput>, uploadRoot?: string): CreateJobInput {
  const productUrl = normalizeUrl(raw.productUrl ?? "", "Product URL");
  const rawInspiration = (raw.inspiration ?? "").trim();
  if (!rawInspiration) throw new ValidationError("Upload an inspiration video");
  if (/^https?:/i.test(rawInspiration)) {
    throw new ValidationError("Remote inspiration URLs are disabled in the local preview; upload the video instead");
  }
  const inspiration = validateUploadPath(rawInspiration, uploadRoot);
  const format: JobFormat = raw.format === "portrait" ? "portrait" : "landscape";
  return { productUrl, inspiration, format };
}

export function createJob(input: CreateJobInput): LaunchJob {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    ...input,
    format: input.format ?? "landscape",
    status: "queued",
    createdAt: now,
    updatedAt: now,
    artifacts: {},
    events: [{ stage: "queued", message: "Director accepted the brief", at: now }],
  };
}
