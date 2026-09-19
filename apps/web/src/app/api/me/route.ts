import { NextRequest, NextResponse } from "next/server";
import { getProfile, resolvePlan, getWalletState, walletToDto } from "@rendervid/core";
import { requireUser, errorResponse } from "@/lib/api-auth";
import { randomUUID } from "node:crypto";

export async function GET(req: NextRequest) {
  const requestId = randomUUID();
  try {
    const { userId } = await requireUser(req);
    const [profile, plan, wallet] = await Promise.all([
      getProfile(userId),
      resolvePlan(userId),
      getWalletState(userId),
    ]);
    if (!profile) {
      return NextResponse.json({ error: { code: "not_found", message: "Profile not found" } }, { status: 404 });
    }
    return NextResponse.json({
      user: {
        id: profile.userId,
        email: profile.email,
        displayName: profile.displayName,
        onboardingCompleted: profile.onboardingCompleted,
        isAdmin: profile.isAdmin,
      },
      plan: {
        planId: plan.planId,
        watermarkEnabled: plan.watermarkEnabled,
        hasActiveSubscription: plan.hasActiveSubscription,
      },
      wallet: walletToDto(wallet),
    });
  } catch (err) {
    return errorResponse(err, requestId);
  }
}
