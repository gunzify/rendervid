import { NextRequest, NextResponse } from "next/server";
import { handleStripeWebhook } from "@rendervid/core";

export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: { code: "bad_request", message: "Missing signature" } }, { status: 400 });
  }
  const raw = Buffer.from(await req.arrayBuffer());
  try {
    await handleStripeWebhook(raw, signature);
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[stripe-webhook]", err);
    return NextResponse.json({ error: { code: "bad_request", message: "Webhook processing failed" } }, { status: 400 });
  }
}
