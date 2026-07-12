import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import staticFiles from "@fastify/static";
import Fastify from "fastify";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { join, resolve } from "node:path";
import { createJob, validateCreateInput, ValidationError } from "./job.js";
import { runJob } from "./runner.js";
import { JobStore } from "./store.js";
import type { CreateJobInput } from "./types.js";

const ROOT = resolve(process.cwd(), process.cwd().endsWith("apps/api") ? "../.." : ".");
try {
  const env = await import("node:fs/promises").then((fs) => fs.readFile(join(ROOT, ".env"), "utf8"));
  for (const line of env.split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match && match[1] && !(match[1] in process.env)) process.env[match[1]] = match[2] ?? "";
  }
} catch {
  // No .env is fine; the shell environment wins either way.
}
const PORT = Number(process.env.PORT ?? 8787);
const UPLOAD_DIR = join(ROOT, "data/uploads");
const app = Fastify({ logger: true, bodyLimit: 2 * 1024 * 1024 });
const store = new JobStore(join(ROOT, "data/jobs.json"));

await store.load();
for (const job of store.list()) {
  if (!["completed", "failed"].includes(job.status)) {
    job.error = "The local server restarted before this job finished";
    await store.transition(job, "failed", "Director marked an interrupted run ready for retry");
  }
}
await app.register(cors, {
  origin: [/^http:\/\/(localhost|127\.0\.0\.1):5173$/],
  methods: ["GET", "POST"],
});
await app.register(multipart, { limits: { fileSize: 200 * 1024 * 1024, files: 1 } });
await app.register(staticFiles, { root: join(ROOT, "runs"), prefix: "/runs/", decorateReply: false });

function publicJob(job: ReturnType<JobStore["list"]>[number]) {
  const { inspiration: _inspiration, ...safe } = job;
  return safe;
}

app.get("/api/health", async () => ({ ok: true, service: "launchreel-api" }));
app.get("/api/jobs", async () => ({ jobs: store.list().map(publicJob) }));
app.get<{ Params: { id: string } }>("/api/jobs/:id", async (request, reply) => {
  const job = store.get(request.params.id);
  return job ? { job: publicJob(job) } : reply.code(404).send({ error: "Job not found" });
});

app.post("/api/jobs", async (request, reply) => {
  try {
    const fields: Partial<CreateJobInput> = {};
    if (request.isMultipart()) {
      await mkdir(UPLOAD_DIR, { recursive: true });
      for await (const part of request.parts()) {
        if (part.type === "file") {
          if (!part.mimetype.startsWith("video/")) throw new ValidationError("Upload must be a video file");
          const target = join(UPLOAD_DIR, `${crypto.randomUUID()}-${part.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`);
          await pipeline(part.file, createWriteStream(target));
          fields.inspiration = target;
        } else if (["productUrl", "format"].includes(part.fieldname)) {
          (fields as Record<string, string>)[part.fieldname] = String(part.value);
        }
      }
    } else {
      Object.assign(fields, request.body as Partial<CreateJobInput>);
    }
    const input = validateCreateInput(fields, request.isMultipart() ? UPLOAD_DIR : undefined);
    const job = createJob(input);
    await store.save(job);
    void runJob(job, store);
    return reply.code(202).send({ job: publicJob(job) });
  } catch (error) {
    if (error instanceof ValidationError) return reply.code(400).send({ error: error.message });
    request.log.error(error);
    return reply.code(500).send({ error: "Could not create the production job" });
  }
});

app.post<{ Params: { id: string } }>("/api/jobs/:id/retry", async (request, reply) => {
  const job = store.get(request.params.id);
  if (!job) return reply.code(404).send({ error: "Job not found" });
  if (!["failed", "completed"].includes(job.status)) return reply.code(409).send({ error: "Job is already running" });
  job.error = undefined;
  await store.transition(job, "queued", "Director claimed the retry");
  void runJob(job, store);
  return reply.code(202).send({ job: publicJob(job) });
});

await app.listen({ port: PORT, host: "127.0.0.1" });
