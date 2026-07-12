import assert from "node:assert/strict";
import { mkdir, mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { renderFallback } from "./runner.js";
import type { LaunchJob } from "./types.js";

test("fallback renderer produces a playable MP4 without ffmpeg drawtext", async () => {
  const runDir = await mkdtemp(join(tmpdir(), "launchreel-render-"));
  await mkdir(runDir, { recursive: true });
  const now = new Date().toISOString();
  const job: LaunchJob = {
    id: "render-test",
    productUrl: "https://example.com/",
    inspiration: "/tmp/reference.mp4",
    format: "landscape",
    status: "rendering",
    createdAt: now,
    updatedAt: now,
    title: "Example Product",
    artifacts: {},
    events: [],
  };

  const output = await renderFallback(job, runDir);
  const info = await stat(output);
  assert.ok(info.size > 1_000, `expected rendered video, got ${info.size} bytes`);
});
