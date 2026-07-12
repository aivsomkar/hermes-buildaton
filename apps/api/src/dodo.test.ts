import assert from "node:assert/strict";
import test from "node:test";
import { createCheckout, verifyDodoWebhook } from "./dodo.js";

test("creates a test checkout for the configured HD product", async () => {
  let body: unknown;
  const gateway = {
    checkoutSessions: {
      create: async (input: unknown) => {
        body = input;
        return { session_id: "cks_test", checkout_url: "https://test.checkout.dodopayments.com/cks_test" };
      },
    },
  };

  const checkout = await createCheckout(gateway, {
    productId: "pdt_hd",
    returnUrl: "https://launchreel.vercel.app/jobs/job_1?payment=success",
    cancelUrl: "https://launchreel.vercel.app/jobs/job_1?payment=cancelled",
    jobId: "job_1",
  });

  assert.equal(checkout.url, "https://test.checkout.dodopayments.com/cks_test");
  assert.deepEqual(body, {
    product_cart: [{ product_id: "pdt_hd", quantity: 1 }],
    return_url: "https://launchreel.vercel.app/jobs/job_1?payment=success",
    cancel_url: "https://launchreel.vercel.app/jobs/job_1?payment=cancelled",
    metadata: { launchreel_job_id: "job_1" },
  });
});

test("verifies webhook bodies through the official SDK before parsing events", () => {
  let captured = "";
  const gateway = {
    webhooks: {
      unwrap: (body: string) => {
        captured = body;
        return { type: "payment.succeeded", data: { payment_id: "pay_1" } };
      },
    },
  };

  const event = verifyDodoWebhook(gateway, '{"type":"payment.succeeded"}', {
    "webhook-id": "msg_1",
    "webhook-signature": "v1,signature",
    "webhook-timestamp": "1700000000",
  });

  assert.equal(captured, '{"type":"payment.succeeded"}');
  assert.equal(event.type, "payment.succeeded");
});
