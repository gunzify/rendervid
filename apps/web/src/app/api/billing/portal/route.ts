import { NextRequest, NextResponse } from "next/server";
import { createPortalSession, isStripeConfigured } from "@rendervid/core";
import { requireUser, errorResponse } from "@/lib/api-auth";
import { httpError } from "@/lib/api-auth";
import { randomUUID } from "node:crypto";

export async function POST(req: NextRequest) {
  const requestId = randomUUID();
  try {
    const { userId } = await requireUser(req);
    if (!isStripeConfigured()) {
      throw httpError(503, "provider_unavailable", "Payments are not configured yet.");
    }
    const portalUrl = await createPortalSession(userId);
    return NextResponse.json({ portalUrl });
  } catch (err) {
    return errorResponse(err, requestId);
  }
}
