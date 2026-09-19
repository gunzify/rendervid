import { NextRequest, NextResponse } from "next/server";
import { estimateGeneration } from "@rendervid/core";
import { EstimateRequest } from "@rendervid/shared";
import { requireUser, errorResponse, readJson } from "@/lib/api-auth";
import { randomUUID } from "node:crypto";

export async function POST(req: NextRequest) {
  const requestId = randomUUID();
  try {
    const { userId } = await requireUser(req);
    const body = await readJson<unknown>(req);
    const parsed = EstimateRequest.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "bad_request", message: "Describe your idea to get an estimate." } },
        { status: 400 },
      );
    }
    const estimate = await estimateGeneration(userId, parsed.data);
    return NextResponse.json(estimate);
  } catch (err) {
    return errorResponse(err, requestId);
  }
}
