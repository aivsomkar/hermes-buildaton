import assert from "node:assert/strict";
import test from "node:test";
import { createJob, validateCreateInput, ValidationError } from "./job.js";

test("normalizes a valid uploaded-video brief", () => {
  const input = validateCreateInput({
    productUrl: "https://example.com",
    inspiration: "/tmp/launchreel-uploads/demo.mp4",
    format: "portrait",
  }, "/tmp/launchreel-uploads");
  assert.equal(input.productUrl, "https://example.com/");
  assert.equal(input.inspiration, "/tmp/launchreel-uploads/demo.mp4");
  assert.equal(input.format, "portrait");
});

test("rejects private product URLs and arbitrary server paths", () => {
  assert.throws(() => validateCreateInput({
    productUrl: "http://127.0.0.1:3000",
    inspiration: "/tmp/launchreel-uploads/demo.mp4",
  }, "/tmp/launchreel-uploads"), ValidationError);
  assert.throws(() => validateCreateInput({
    productUrl: "https://example.com",
    inspiration: "/etc/passwd",
  }, "/tmp/launchreel-uploads"), ValidationError);
});

test("rejects remote inspiration URLs in the local preview", () => {
  assert.throws(() => validateCreateInput({
    productUrl: "https://example.com",
    inspiration: "https://youtube.com/watch?v=demo",
  }), ValidationError);
});

test("creates a queued job with an audit event", () => {
  const job = createJob({
    productUrl: "https://example.com/",
    inspiration: "/tmp/launchreel-uploads/demo.mp4",
    format: "landscape",
  });
  assert.equal(job.status, "queued");
  assert.equal(job.events.length, 1);
  assert.ok(job.id);
});
