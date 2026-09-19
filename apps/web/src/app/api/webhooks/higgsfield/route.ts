import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@rendervid/core";
import { enqueue } from "@rendervid/core";
import { ProviderWebhookPayload } from "@rendervid/shared";

/**
 * Provider webhook (fast path). The poller remains the source of truth:
 * we verify + enqueue a poll, and all settlement dedupes by generation id.
 * Configure the provider to POST here; signature header is `x-rv-signature`.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const secret = env.higgsfield().webhookSecret;
  if (secret) {
    const sig = req.headers.get("x-rv-signature") ?? "";
    const expected = createHmac("sha256", secret).update(raw).digest("hex");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return NextResponse.json({ error: { code: "unauthorized", message: "Invalid signature" } }, { status: 401 });
    }
  }

  const parsed = ProviderWebhookPayload.safeParse(JSON.parse(raw || "{}"));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "bad_request", message: "Invalid payload" } }, { status: 400 });
  }

  // Look up our generation by provider request id via a lightweight poll job.
  // The poller resolves the generation from providerRequestId; we pass it through.
  await enqueue("generation", "poll", { providerRequestId: parsed.data.requestId, pollIndex: 0 });

  return NextResponse.json({ received: true });
}
