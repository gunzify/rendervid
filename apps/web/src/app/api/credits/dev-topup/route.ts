import { NextRequest, NextResponse } from "next/server";
import { requireUser, errorResponse } from "@/lib/api-auth";
import { grantCredits, devAuthEnabled } from "@rendervid/core";
import { randomUUID } from "node:crypto";

/**
 * LOCAL DEV ONLY: tops up the wallet with paid credits so the full product
 * loop is testable without Stripe. Refuses to run when Supabase is configured
 * (i.e. in any real deployment).
 */
export async function POST(req: NextRequest) {
  const requestId = randomUUID();
  try {
    if (!devAuthEnabled()) {
      return NextResponse.json(
        { error: { code: "forbidden", message: "Dev top-up is only available in local dev mode." } },
        { status: 403 },
      );
    }
    const { userId } = await requireUser(req);
    const wallet = await grantCredits({
      userId,
      amount: 100_000,
      pool: "paid",
      type: "ADMIN_ADJUSTMENT",
      description: "Local development top-up",
      dedupeKey: `dev-topup:${userId}:${randomUUID()}`,
    });
    return NextResponse.json(wallet);
  } catch (err) {
    return errorResponse(err, requestId);
  }
}
