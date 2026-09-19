import { NextRequest, NextResponse } from "next/server";
import { listPlans, creditPacks, resolvePlan } from "@rendervid/core";
import { requireUserOptional } from "@/lib/api-auth-extra";
import { errorResponse } from "@/lib/api-auth";
import { randomUUID } from "node:crypto";

export async function GET(req: NextRequest) {
  const requestId = randomUUID();
  try {
    const { userId } = await requireUserOptional(req);
    const current = userId ? (await resolvePlan(userId)).planId : null;
    const plans = await listPlans(current);
    return NextResponse.json({ plans, packs: creditPacks() });
  } catch (err) {
    return errorResponse(err, requestId);
  }
}
