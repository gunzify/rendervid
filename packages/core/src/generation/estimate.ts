/**
 * Estimates (PRD §8, §59): shown BEFORE any charge. User-safe breakdown only.
 * The final charge is always recomputed server-side at creation time.
 */
import { randomUUID, createHmac } from "node:crypto";
import type {
  EstimateRequest,
  EstimateResponse,
  EstimateBreakdownLine,
  CreditAmount,
} from "@rendervid/shared";
import { createPlan } from "../director/director.js";
import { displayContentType } from "../director/types.js";
import { capabilityForPlan, selectModel, priceFor } from "../router/router.js";
import { getPricingConfig, buildBreakdown } from "../pricing/pricing.js";
import { getWalletState } from "../credits/wallet.js";
import { env } from "../env.js";

function signEstimateToken(credits: number, ttlSeconds = 300): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${credits}.${exp}.${randomUUID()}`;
  const sig = createHmac("sha256", env.appSecret()).update(payload).digest("hex").slice(0, 32);
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

export async function estimateGeneration(
  userId: string,
  req: EstimateRequest,
): Promise<EstimateResponse> {
  const plan = await createPlan({
    prompt: req.prompt,
    mode: req.mode,
    assetCount: req.assetIds.length,
    mediaHint: req.mediaHint,
  });

  const model = await selectModel(plan, req.mode, {
    durationSeconds: plan.durationSeconds,
    hasImageInput: req.assetIds.length > 0,
  });

  const providerCost = priceFor(model.costType, model.costMicroUsd, plan.durationSeconds);
  const config = await getPricingConfig();
  const breakdown = buildBreakdown(providerCost, config);

  const wallet = await getWalletState(userId);
  const available = wallet.paidCredits + wallet.bonusCredits - wallet.reservedCredits;

  const lines: EstimateBreakdownLine[] = [
    {
      label: `${displayContentType(plan)} · ${plan.quality} quality`,
      detail: [
        plan.durationSeconds !== null ? `${plan.durationSeconds} seconds` : null,
        plan.aspectRatio,
      ]
        .filter(Boolean)
        .join(" · ") || undefined,
      credits: breakdown.credits as CreditAmount,
    },
    {
      label: "Credits are returned automatically if the creation fails",
      credits: 0,
    },
  ];

  return {
    estimateId: signEstimateToken(breakdown.credits),
    contentType: displayContentType(plan),
    quality: plan.quality,
    durationSeconds: plan.durationSeconds,
    aspectRatio: plan.aspectRatio,
    estimatedCredits: breakdown.credits as CreditAmount,
    walletBalance: available as CreditAmount,
    remainingAfter: available - breakdown.credits,
    affordable: available >= breakdown.credits,
    breakdown: lines,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  };
}
