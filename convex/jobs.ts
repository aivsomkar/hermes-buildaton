import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { stage } from "./schema";

const format = v.union(v.literal("landscape"), v.literal("portrait"));
const input = v.object({ pathname: v.string(), contentType: v.string(), size: v.number() });
const artifacts = v.object({
  breakdown: v.optional(v.string()),
  styleBrief: v.optional(v.string()),
  beats: v.optional(v.string()),
  script: v.optional(v.string()),
  video: v.optional(v.string()),
  contactSheet: v.optional(v.string()),
});

function assertProductUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a valid product URL");
  }
  if (url.protocol !== "https:") throw new Error("Production product URLs must use HTTPS");
}

function assertInput(value: { pathname: string; contentType: string; size: number }) {
  if (!value.pathname.startsWith("inspirations/") || value.pathname.includes("..")) throw new Error("Invalid source pathname");
  if (!["video/mp4", "video/quicktime", "video/webm"].includes(value.contentType)) throw new Error("Upload must be MP4, MOV, or WebM");
  if (value.size <= 0 || value.size > 200 * 1024 * 1024) throw new Error("Upload must be between 1 byte and 200 MB");
}

export const create = mutation({
  args: { productUrl: v.string(), format, input },
  handler: async (ctx, args) => {
    assertProductUrl(args.productUrl);
    assertInput(args.input);
    const now = Date.now();
    const id = await ctx.db.insert("jobs", {
      ...args,
      status: "queued",
      attempt: 0,
      artifacts: {},
      paymentStatus: "not_required",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("jobEvents", { jobId: id, stage: "queued", message: "Director accepted the production brief", at: now });
    return id;
  },
});

export const get = query({
  args: { id: v.id("jobs") },
  handler: async (ctx, { id }) => {
    const job = await ctx.db.get(id);
    if (!job) return null;
    const events = await ctx.db.query("jobEvents").withIndex("by_job_at", (q) => q.eq("jobId", id)).order("asc").collect();
    return { ...job, events };
  },
});

export const retry = mutation({
  args: { id: v.id("jobs") },
  handler: async (ctx, { id }) => {
    const job = await ctx.db.get(id);
    if (!job) throw new Error("Job not found");
    if (!["completed", "failed"].includes(job.status)) throw new Error("Job is already running");
    const now = Date.now();
    await ctx.db.patch(id, {
      status: "queued",
      attempt: job.attempt + 1,
      error: undefined,
      leaseToken: undefined,
      leaseExpiresAt: undefined,
      workerId: undefined,
      updatedAt: now,
    });
    await ctx.db.insert("jobEvents", { jobId: id, stage: "queued", message: "Director queued a fresh render attempt", at: now });
  },
});

const ACTIVE_STAGES = ["researching", "analyzing_reference", "writing_script", "rendering"] as const;

export const claim = internalMutation({
  args: { workerId: v.string(), leaseToken: v.string(), now: v.number(), leaseExpiresAt: v.number() },
  handler: async (ctx, args) => {
    let queued = await ctx.db.query("jobs").withIndex("by_status_createdAt", (q) => q.eq("status", "queued")).order("asc").first();
    if (!queued) {
      // Reclaim orphans: active jobs whose worker lease expired (crashed/killed worker).
      for (const stage of ACTIVE_STAGES) {
        const orphan = await ctx.db
          .query("jobs")
          .withIndex("by_status_leaseExpiresAt", (q) => q.eq("status", stage).lt("leaseExpiresAt", args.now))
          .first();
        if (orphan) {
          await ctx.db.insert("jobEvents", {
            jobId: orphan._id, stage: "queued",
            message: "Director reclaimed the job from an expired worker lease", at: args.now,
          });
          queued = { ...orphan, attempt: orphan.attempt + 1 };
          break;
        }
      }
    }
    if (!queued) return null;
    await ctx.db.patch(queued._id, {
      status: "researching",
      leaseToken: args.leaseToken,
      leaseExpiresAt: args.leaseExpiresAt,
      workerId: args.workerId,
      updatedAt: args.now,
    });
    await ctx.db.insert("jobEvents", {
      jobId: queued._id,
      stage: "researching",
      message: "Render worker claimed the job",
      at: args.now,
    });
    return { ...queued, status: "researching", leaseToken: args.leaseToken, leaseExpiresAt: args.leaseExpiresAt, workerId: args.workerId };
  },
});

export const progress = internalMutation({
  args: {
    id: v.id("jobs"),
    leaseToken: v.string(),
    stage,
    message: v.string(),
    now: v.number(),
    leaseExpiresAt: v.number(),
    title: v.optional(v.string()),
    productSummary: v.optional(v.string()),
    artifacts: v.optional(artifacts),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.id);
    if (!job || job.leaseToken !== args.leaseToken) throw new Error("Stale worker lease");
    await ctx.db.patch(args.id, {
      status: args.stage,
      updatedAt: args.now,
      leaseExpiresAt: args.leaseExpiresAt,
      title: args.title ?? job.title,
      productSummary: args.productSummary ?? job.productSummary,
      artifacts: args.artifacts ?? job.artifacts,
    });
    await ctx.db.insert("jobEvents", { jobId: args.id, stage: args.stage, message: args.message, at: args.now });
  },
});

export const complete = internalMutation({
  args: { id: v.id("jobs"), leaseToken: v.string(), artifacts, now: v.number() },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.id);
    if (!job || job.leaseToken !== args.leaseToken) throw new Error("Stale worker lease");
    await ctx.db.patch(args.id, {
      status: "completed",
      artifacts: args.artifacts,
      updatedAt: args.now,
      leaseToken: undefined,
      leaseExpiresAt: undefined,
    });
    await ctx.db.insert("jobEvents", { jobId: args.id, stage: "completed", message: "Director packaged the production artifacts", at: args.now });
  },
});

export const markPaid = internalMutation({
  args: { id: v.id("jobs"), externalId: v.string(), checkoutId: v.optional(v.string()), now: v.number() },
  handler: async (ctx, args) => {
    const duplicate = await ctx.db
      .query("webhookReceipts")
      .withIndex("by_provider_externalId", (q) => q.eq("provider", "dodo").eq("externalId", args.externalId))
      .first();
    if (duplicate) return false;
    const job = await ctx.db.get(args.id);
    if (!job) throw new Error("Job not found");
    await ctx.db.insert("webhookReceipts", { provider: "dodo", externalId: args.externalId, receivedAt: args.now });
    await ctx.db.patch(args.id, { paymentStatus: "paid", dodoCheckoutId: args.checkoutId, updatedAt: args.now });
    return true;
  },
});

export const fail = internalMutation({
  args: { id: v.id("jobs"), leaseToken: v.string(), error: v.string(), now: v.number() },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.id);
    if (!job || job.leaseToken !== args.leaseToken) throw new Error("Stale worker lease");
    await ctx.db.patch(args.id, {
      status: "failed",
      error: args.error,
      updatedAt: args.now,
      leaseToken: undefined,
      leaseExpiresAt: undefined,
    });
    await ctx.db.insert("jobEvents", { jobId: args.id, stage: "failed", message: "Director preserved a retryable failure", at: args.now });
  },
});
