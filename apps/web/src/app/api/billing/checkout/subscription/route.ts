import { NextRequest, NextResponse } from "next/server";
import { createSubscriptionCheckout, isStripeConfigured } from "@rendervid/core";
import { requireUser, errorResponse, readJson } from "@/lib/api-auth";
import { httpError } from "@/lib/api-auth";
import { randomUUID } from "node:crypto";

export async function POST(req: NextRequest) {
  const requestId = randomUUID();
  try {
    const { userId } = await requireUser(req);
    if (!isStripeConfigured()) {
      throw httpError(503, "provider_unavailable", "Payments are not configured yet. Stripe keys required.");
    }
    const body = await readJson<{ planId?: string }>(req);
    if (!body.planId || body.planId === "free") {
      throw httpError(400, "bad_request", "Choose a paid plan first.");
    }
    const checkoutUrl = await createSubscriptionCheckout(userId, body.planId);
    return NextResponse.json({ checkoutUrl });
  } catch (err) {
    return errorResponse(err, requestId);
  }
}
