import { NextRequest, NextResponse } from "next/server";
import { getBillingDto, resolvePlan } from "@rendervid/core";
import { requireUser, errorResponse } from "@/lib/api-auth";
import { randomUUID } from "node:crypto";

export async function GET(req: NextRequest) {
  const requestId = randomUUID();
  try {
    const { userId } = await requireUser(req);
    const plan = await resolvePlan(userId);
    return NextResponse.json(await getBillingDto(userId, plan.planId));
  } catch (err) {
    return errorResponse(err, requestId);
  }
}
