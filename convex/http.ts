import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import DodoPayments from "dodopayments";

const http = httpRouter();
const LEASE_MS = 10 * 60_000;

function authorized(request: Request): boolean {
  const secret = process.env.WORKER_SHARED_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const workerAction = (handler: (ctx: any, body: any) => Promise<unknown>) =>
  httpAction(async (ctx, request) => {
    if (!authorized(request)) return json({ error: "Unauthorized" }, 401);
    try {
      const body = request.method === "POST" ? await request.json() : {};
      return json(await handler(ctx, body));
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Worker request failed" }, 400);
    }
  });

http.route({
  path: "/worker/claim",
  method: "POST",
  handler: workerAction(async (ctx, body) => {
    const now = Date.now();
    return ctx.runMutation(internal.jobs.claim, {
      workerId: String(body.workerId || "worker"),
      leaseToken: crypto.randomUUID(),
      now,
      leaseExpiresAt: now + LEASE_MS,
    });
  }),
});

http.route({
  path: "/worker/progress",
  method: "POST",
  handler: workerAction(async (ctx, body) => {
    const now = Date.now();
    await ctx.runMutation(internal.jobs.progress, { ...body, now, leaseExpiresAt: now + LEASE_MS });
    return { ok: true };
  }),
});

http.route({
  path: "/worker/complete",
  method: "POST",
  handler: workerAction(async (ctx, body) => {
    await ctx.runMutation(internal.jobs.complete, { ...body, now: Date.now() });
    return { ok: true };
  }),
});

http.route({
  path: "/worker/fail",
  method: "POST",
  handler: workerAction(async (ctx, body) => {
    await ctx.runMutation(internal.jobs.fail, { ...body, now: Date.now() });
    return { ok: true };
  }),
});

http.route({
  path: "/webhooks/dodo",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const apiKey = process.env.DODO_PAYMENTS_API_KEY;
    const webhookKey = process.env.DODO_PAYMENTS_WEBHOOK_KEY;
    if (!apiKey || !webhookKey) return json({ error: "Dodo webhook is not configured" }, 503);
    try {
      const rawBody = await request.text();
      const headers = Object.fromEntries(request.headers.entries());
      const client = new DodoPayments({
        bearerToken: apiKey,
        webhookKey,
        environment: process.env.DODO_PAYMENTS_ENVIRONMENT === "live_mode" ? "live_mode" : "test_mode",
      });
      const event = client.webhooks.unwrap(rawBody, { headers }) as {
        type: string;
        data?: { metadata?: Record<string, string>; payment_id?: string; checkout_id?: string };
      };
      if (event.type === "payment.succeeded") {
        const id = event.data?.metadata?.launchreel_job_id;
        const externalId = request.headers.get("webhook-id");
        if (!id || !externalId) throw new Error("Signed payment event is missing job metadata");
        await ctx.runMutation(internal.jobs.markPaid, {
          id,
          externalId,
          checkoutId: event.data?.checkout_id ?? event.data?.payment_id,
          now: Date.now(),
        });
      }
      return json({ received: true });
    } catch {
      return json({ error: "Invalid webhook" }, 400);
    }
  }),
});

export default http;
