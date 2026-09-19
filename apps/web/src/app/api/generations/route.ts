import { NextRequest, NextResponse } from "next/server";
import { createGeneration, listGenerations, assertWithinGenerationQuota, resolvePlan } from "@rendervid/core";
import { CreateGenerationRequest } from "@rendervid/shared";
import { requireUser, errorResponse, readJson } from "@/lib/api-auth";
import { randomUUID } from "node:crypto";

export async function POST(req: NextRequest) {
  const requestId = randomUUID();
  try {
    const { userId } = await requireUser(req);
    const body = await readJson<unknown>(req);
    const parsed = CreateGenerationRequest.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "bad_request", message: "Describe what you want to create first." } },
        { status: 400 },
      );
    }

    const plan = await resolvePlan(userId);
    await assertWithinGenerationQuota(userId, plan.planId);

    const result = await createGeneration(userId, parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err, requestId);
  }
}

export async function GET(req: NextRequest) {
  const requestId = randomUUID();
  try {
    const { userId } = await requireUser(req);
    const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined;
    const limit = Number(req.nextUrl.searchParams.get("limit") ?? "20");
    const result = await listGenerations(userId, { cursor, limit });
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err, requestId);
  }
}
