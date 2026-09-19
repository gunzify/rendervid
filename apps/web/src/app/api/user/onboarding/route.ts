import { NextRequest, NextResponse } from "next/server";
import { completeOnboarding } from "@rendervid/core";
import { OnboardingUpdate } from "@rendervid/shared";
import { requireUser, errorResponse, readJson } from "@/lib/api-auth";
import { randomUUID } from "node:crypto";

export async function POST(req: NextRequest) {
  const requestId = randomUUID();
  try {
    const { userId } = await requireUser(req);
    const body = await readJson<unknown>(req);
    const parsed = OnboardingUpdate.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: { code: "bad_request", message: "Pick at least one interest." } }, { status: 400 });
    }
    await completeOnboarding(userId, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, requestId);
  }
}
