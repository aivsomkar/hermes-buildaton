import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const stage = v.union(
  v.literal("queued"),
  v.literal("researching"),
  v.literal("analyzing_reference"),
  v.literal("writing_script"),
  v.literal("rendering"),
  v.literal("completed"),
  v.literal("failed"),
);

const artifactFields = {
  breakdown: v.optional(v.string()),
  styleBrief: v.optional(v.string()),
  beats: v.optional(v.string()),
  script: v.optional(v.string()),
  video: v.optional(v.string()),
  contactSheet: v.optional(v.string()),
};

export default defineSchema({
  jobs: defineTable({
    productUrl: v.string(),
    format: v.union(v.literal("landscape"), v.literal("portrait")),
    input: v.object({
      pathname: v.string(),
      contentType: v.string(),
      size: v.number(),
    }),
    status: stage,
    attempt: v.number(),
    leaseToken: v.optional(v.string()),
    leaseExpiresAt: v.optional(v.number()),
    workerId: v.optional(v.string()),
    title: v.optional(v.string()),
    productSummary: v.optional(v.string()),
    artifacts: v.object(artifactFields),
    error: v.optional(v.string()),
    paymentStatus: v.union(v.literal("not_required"), v.literal("pending"), v.literal("paid")),
    dodoCheckoutId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status_createdAt", ["status", "createdAt"])
    .index("by_status_leaseExpiresAt", ["status", "leaseExpiresAt"]),

  jobEvents: defineTable({
    jobId: v.id("jobs"),
    stage,
    message: v.string(),
    at: v.number(),
  }).index("by_job_at", ["jobId", "at"]),

  webhookReceipts: defineTable({
    provider: v.union(v.literal("dodo"), v.literal("lumenfall")),
    externalId: v.string(),
    receivedAt: v.number(),
  }).index("by_provider_externalId", ["provider", "externalId"]),
});
