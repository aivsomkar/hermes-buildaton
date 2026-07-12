import assert from "node:assert/strict";
import test from "node:test";
import { LumenfallClient, LumenfallError } from "./lumenfall.js";

const request = {
  model: "sora-2",
  prompt: "A precise UI macro shot with layered cursor motion",
  seconds: 10,
  size: "1920x1080",
  idempotency_key: "job-123-shot-1",
};

test("estimates a video without charging and sends bearer auth", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const client = new LumenfallClient({
    apiKey: "lmnfl_test",
    fetchImpl: async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return Response.json({ estimated: true, total_cost_micros: 250000, currency: "USD" });
    },
  });

  const estimate = await client.estimateVideo(request);

  assert.equal(capturedUrl, "https://api.lumenfall.ai/openai/v1/videos?dryRun=true");
  assert.equal(new Headers(capturedInit?.headers).get("authorization"), "Bearer lmnfl_test");
  assert.deepEqual(JSON.parse(String(capturedInit?.body)), request);
  assert.equal(estimate.total_cost_micros, 250000);
});

test("waits for an asynchronous video and returns its temporary output", async () => {
  const states = [
    { id: "video_1", status: "queued" },
    { id: "video_1", status: "in_progress" },
    { id: "video_1", status: "completed", output: { url: "https://media.lumenfall.ai/video_1.mp4", content_type: "video/mp4", size_bytes: 1024 } },
  ];
  const client = new LumenfallClient({
    apiKey: "lmnfl_test",
    fetchImpl: async () => Response.json(states.shift()),
    sleep: async () => undefined,
  });

  const result = await client.waitForVideo("video_1", { timeoutMs: 1000, pollMs: 1 });

  assert.equal(result.output?.url, "https://media.lumenfall.ai/video_1.mp4");
});

test("surfaces asynchronous provider failures without leaking undefined output", async () => {
  const client = new LumenfallClient({
    apiKey: "lmnfl_test",
    fetchImpl: async () => Response.json({ id: "video_2", status: "failed", error: { code: "provider_failed", message: "generation failed" } }),
  });

  await assert.rejects(() => client.waitForVideo("video_2", { timeoutMs: 100, pollMs: 1 }), (error: unknown) => {
    assert.ok(error instanceof LumenfallError);
    assert.equal(error.code, "provider_failed");
    return true;
  });
});
