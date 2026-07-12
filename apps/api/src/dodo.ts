import DodoPayments from "dodopayments";

interface CheckoutGateway {
  checkoutSessions: {
    create(input: {
      product_cart: Array<{ product_id: string; quantity: number }>;
      return_url: string;
      cancel_url: string;
      metadata: Record<string, string>;
    }): Promise<{ session_id: string; checkout_url?: string | null }>;
  };
}

interface WebhookGateway {
  webhooks: {
    unwrap(body: string, options?: { headers: Record<string, string>; key?: string }): { type: string; [key: string]: unknown };
  };
}

export interface CheckoutInput {
  productId: string;
  returnUrl: string;
  cancelUrl: string;
  jobId: string;
}

export interface CheckoutResult {
  id: string;
  url: string;
}

export function createDodoGateway(options: {
  apiKey: string;
  webhookKey?: string;
  environment?: "test_mode" | "live_mode";
}): DodoPayments {
  return new DodoPayments({
    bearerToken: options.apiKey,
    webhookKey: options.webhookKey,
    environment: options.environment ?? "test_mode",
  });
}

export async function createCheckout(gateway: CheckoutGateway, input: CheckoutInput): Promise<CheckoutResult> {
  for (const [name, value] of Object.entries(input)) {
    if (!value.trim()) throw new Error(`${name} is required`);
  }
  const checkout = await gateway.checkoutSessions.create({
    product_cart: [{ product_id: input.productId, quantity: 1 }],
    return_url: input.returnUrl,
    cancel_url: input.cancelUrl,
    metadata: { launchreel_job_id: input.jobId },
  });
  if (!checkout.checkout_url?.startsWith("https://")) throw new Error("Dodo did not return a secure checkout URL");
  return { id: checkout.session_id, url: checkout.checkout_url };
}

export function verifyDodoWebhook(
  gateway: WebhookGateway,
  rawBody: string,
  headers: Record<string, string>,
): { type: string; [key: string]: unknown } {
  return gateway.webhooks.unwrap(rawBody, { headers });
}
