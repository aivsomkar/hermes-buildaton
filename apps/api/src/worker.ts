import { head } from "@vercel/blob";
import { put } from "@vercel/blob";
import { createWriteStream } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { runJob, type JobSink } from "./runner.js";
import type { JobStage, LaunchJob } from "./types.js";

const ROOT = resolve(process.cwd(), process.cwd().endsWith("apps/api") ? "../.." : ".");

// Load .env exactly like the local server does.
try {
  const env = await readFile(join(ROOT, ".env"), "utf8");
  for (const line of env.split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match && match[1] && !(match[1] in process.env)) process.env[match[1]] = match[2] ?? "";
  }
} catch {
  // Shell environment wins.
}

const SITE = process.env.CONVEX_SITE_URL?.replace(/\/$/, "");
const SECRET = process.env.WORKER_SHARED_SECRET;
const WORKER_ID = `launchreel-worker-${process.pid}`;
const POLL_MS = 5_000;
const HEARTBEAT_MS = 4 * 60_000;

if (!SITE || !SECRET) {
  process.stderr.write("Set CONVEX_SITE_URL and WORKER_SHARED_SECRET to run the render worker\n");
  process.exit(1);
}

interface ConvexJobDoc {
  _id: string;
  productUrl: string;
  format: "landscape" | "portrait";
  input: { pathname: string; contentType: string; size: number };
  leaseToken: string;
  attempt: number;
}

async function convex<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${SITE}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${SECRET}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? `${path} failed (${response.status})`);
  return payload;
}

async function downloadInspiration(pathname: string, target: string): Promise<void> {
  const token = process.env.SOURCE_BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error("SOURCE_BLOB_READ_WRITE_TOKEN is required to fetch inspiration uploads");
  const blob = await head(pathname, { token });
  const response = await fetch(blob.downloadUrl ?? blob.url);
  if (!response.ok || !response.body) throw new Error(`Inspiration download failed (${response.status})`);
  await pipeline(Readable.fromWeb(response.body as import("node:stream/web").ReadableStream), createWriteStream(target));
}

/**
 * Upload the job's local artifacts to the (private) Blob store and hand back
 * stable Convex `/artifact` links that sign a fresh download URL per view.
 */
async function publishArtifacts(job: LaunchJob): Promise<Record<string, string>> {
  const token = process.env.OUTPUT_BLOB_READ_WRITE_TOKEN ?? process.env.SOURCE_BLOB_READ_WRITE_TOKEN;
  const published: Record<string, string> = {};
  if (!token) return published;
  for (const [key, localUrl] of Object.entries(job.artifacts)) {
    if (!localUrl || localUrl.startsWith("https://")) continue;
    const file = join(ROOT, localUrl.replace(/^\//, ""));
    try {
      const data = await readFile(file);
      const blob = await put(`outputs/${job.id}/${key}-${file.split("/").pop()}`, data, {
        access: "private",
        token,
        addRandomSuffix: true,
      });
      published[key] = `${SITE}/artifact?p=${encodeURIComponent(blob.pathname)}`;
    } catch (error) {
      process.stderr.write(`[worker] Could not publish artifact ${key}: ${error instanceof Error ? error.message : error}\n`);
    }
  }
  return published;
}

class ConvexJobSink implements JobSink {
  private heartbeat?: NodeJS.Timeout;
  private stage: JobStage = "researching";

  constructor(private readonly convexId: string, private readonly leaseToken: string) {
    this.heartbeat = setInterval(() => {
      void convex("/worker/progress", {
        id: this.convexId, leaseToken: this.leaseToken,
        stage: this.stage, message: "Worker heartbeat — job is still in flight",
      }).catch(() => undefined);
    }, HEARTBEAT_MS);
    this.heartbeat.unref?.();
  }

  async save(job: LaunchJob): Promise<void> {
    // Durable state lives in Convex; intermediate saves ride along with transitions.
    void job;
  }

  async transition(job: LaunchJob, stage: JobStage, message: string): Promise<void> {
    job.status = stage;
    this.stage = stage;
    if (stage === "completed") {
      clearInterval(this.heartbeat);
      const published = await publishArtifacts(job);
      await convex("/worker/complete", {
        id: this.convexId, leaseToken: this.leaseToken,
        artifacts: { ...job.artifacts, ...published },
      });
      return;
    }
    if (stage === "failed") {
      clearInterval(this.heartbeat);
      await convex("/worker/fail", {
        id: this.convexId, leaseToken: this.leaseToken,
        error: job.error ?? "Production stage failed",
      });
      return;
    }
    await convex("/worker/progress", {
      id: this.convexId, leaseToken: this.leaseToken, stage, message,
      title: job.title, productSummary: job.productSummary, artifacts: job.artifacts,
    });
  }
}

async function processOne(): Promise<boolean> {
  const doc = await convex<ConvexJobDoc | null>("/worker/claim", { workerId: WORKER_ID });
  if (!doc) return false;
  process.stdout.write(`[worker] Claimed job ${doc._id} (${doc.productUrl})\n`);
  const workDir = join(ROOT, "runs", doc._id);
  await mkdir(workDir, { recursive: true });
  const sink = new ConvexJobSink(doc._id, doc.leaseToken);
  const now = new Date().toISOString();
  const job: LaunchJob = {
    id: doc._id,
    productUrl: doc.productUrl,
    inspiration: join(workDir, "inspiration.mp4"),
    format: doc.format,
    status: "researching",
    createdAt: now,
    updatedAt: now,
    artifacts: {},
    events: [],
  };
  try {
    await downloadInspiration(doc.input.pathname, job.inspiration);
  } catch (error) {
    job.error = error instanceof Error ? error.message : String(error);
    await sink.transition(job, "failed", "Worker could not fetch the inspiration upload");
    return true;
  }
  await runJob(job, sink);
  process.stdout.write(`[worker] Job ${doc._id} finished: ${job.status}\n`);
  return true;
}

process.stdout.write(`[worker] ${WORKER_ID} polling ${SITE} every ${POLL_MS / 1000}s\n`);
for (;;) {
  try {
    const worked = await processOne();
    if (!worked) await new Promise((resolvePromise) => setTimeout(resolvePromise, POLL_MS));
  } catch (error) {
    process.stderr.write(`[worker] ${error instanceof Error ? error.message : error}\n`);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, POLL_MS * 2));
  }
}
