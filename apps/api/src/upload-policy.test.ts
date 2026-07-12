import assert from "node:assert/strict";
import test from "node:test";
import { createUploadPolicy, normalizeUploadPath, validateUploadPath } from "./upload-policy.js";

test("limits source uploads to video MIME types and 200 MB", () => {
  assert.deepEqual(createUploadPolicy(), {
    allowedContentTypes: ["video/mp4", "video/quicktime", "video/webm"],
    maximumSizeInBytes: 200 * 1024 * 1024,
    addRandomSuffix: true,
    allowOverwrite: false,
  });
});

test("normalizes uploaded names under an inspirations prefix", () => {
  assert.equal(normalizeUploadPath("My launch reel (final).mp4"), "inspirations/My_launch_reel__final_.mp4");
  assert.throws(() => normalizeUploadPath("../secret.mp4"), /invalid/i);
});

test("rejects token requests outside the single source prefix", () => {
  assert.doesNotThrow(() => validateUploadPath("inspirations/reference.mp4"));
  assert.throws(() => validateUploadPath("outputs/stolen.mp4"), /invalid/i);
  assert.throws(() => validateUploadPath("inspirations/nested/reference.mp4"), /invalid/i);
});
