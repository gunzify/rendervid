/**
 * Generation creation (PRD §32, §120).
 * One DB transaction: check wallet → price → reserve → insert generation + job → enqueue.
 * The client's estimate is NEVER trusted; price is recomputed here (PRD §73).
 */
import { randomUUID } from "node:crypto";
import type { CreateGenerationRequest, CreateGenerationResponse } from "@rendervid/shared";
import { getDb } from "../db/client.js";
import { generations, generationJobs } from "../db/schema.js";
import { moderatePrompt } from "../security/moderation.js";
import { DomainError } from "../credits/errors.js";
import { createPlan } from "../director/director.js";
import { displayContentType } from "../director/types.js";
import { selectModel, priceFor } from "../router/router.js";
import { getPricingConfig, buildBreakdown } from "../pricing/pricing.js";
import { reserveCreditsTx, getWalletState } from "../credits/wallet.js";
import { enqueue } from "../jobs/queue.js";
import { and, eq } from "drizzle-orm";
import { audit, trackEvent } from "../security/audit.js";

export async function createGeneration(
  userId: string,
  req: CreateGenerationRequest,
): Promise<CreateGenerationResponse> {
  // 1) Moderation gate before anything else (PRD §76).
  const verdict = moderatePrompt(req.prompt);
  if (!verdict.allowed) {
    throw new DomainError("moderation_rejected", "This request can't be completed. Try rephrasing your idea.");
  }

  // 2) Duplicate submissions (double-click / app retry) resolve to the same generation.
  const db = getDb();
  const existing = await db
    .select()
    .from(generations)
    .where(
      and(
        eq(generations.userId, userId),
        eq(generations.idempotencyKey, req.idempotencyKey),
      ),
    )
    .limit(1);
  if (existing[0]) {
    const g = existing[0];
    return {
      generationId: g.id,
      status: g.status,
      reservedCredits: g.reservedCredits,
      walletBalanceAfter:
        (await getWalletState(userId)).paidCredits +
        (await getWalletState(userId)).bonusCredits -
        (await getWalletState(userId)).reservedCredits,
      projectId: g.projectId,
    };
  }

  // 3) Plan (LLM or heuristic), route, and price — all server-side.
  const directorPlan = await createPlan({
    prompt: req.prompt,
    mode: req.mode,
    assetCount: req.assetIds.length,
  });
  const model = await selectModel(directorPlan, req.mode, {
    durationSeconds: directorPlan.durationSeconds,
    hasImageInput: req.assetIds.length > 0,
  });
  const providerCost = priceFor(model.costType, model.costMicroUsd, directorPlan.durationSeconds);
  const pricing = await getPricingConfig();
  const price = buildBreakdown(providerCost, pricing);

  const generationId = randomUUID();

  // 4) Transaction: reserve credits + write generation/job rows atomically (PRD §120).
  const reserved = await getDb().transaction(async (tx) => {
    const walletState = await reserveCreditsTx(tx, {
      userId,
      generationId,
      amount: price.credits,
      dedupeKey: `gen-reserve:${generationId}`,
      description: `Reserved ${price.credits} credits`,
    });

    await tx.insert(generations).values({
      id: generationId,
      userId,
      projectId: req.projectId ?? null,
      status: "credits_reserved",
      prompt: req.prompt,
      normalizedPrompt: directorPlan.subject,
      mode: req.mode,
      directorPlan: directorPlan as unknown as Record<string, unknown>,
      capability: model.capability,
      modelId: model.id,
      contentType: displayContentType(directorPlan),
      quality: directorPlan.quality,
      durationSeconds: directorPlan.durationSeconds,
      aspectRatio: directorPlan.aspectRatio,
      inputAssetIds: req.assetIds,
      providerCostEstimateMicros: price.providerCostMicros,
      providerPriceSnapshot: price.snapshots.provider,
      customerPriceSnapshot: price.snapshots.customer,
      creditPriceSnapshot: price.snapshots.credit,
      estimatedCredits: price.credits,
      reservedCredits: price.credits,
      provider: model.provider,
      idempotencyKey: req.idempotencyKey,
    });

    await tx.insert(generationJobs).values({
      generationId,
      status: "pending",
    });
    return price.credits;
  });

  // 5) Queue for async execution.
  await enqueue("generation", "execute", { generationId }, { jobId: `gen:${generationId}` });

  await trackEvent(userId, "generation_started", { mode: req.mode, capability: model.capability }, generationId);
  await audit({ actor: userId, action: "generation_created", targetType: "generation", targetId: generationId, metadata: { credits: reserved, capability: model.capability } });

  const wallet = await getWalletState(userId);
  return {
    generationId,
    status: "credits_reserved",
    reservedCredits: reserved,
    walletBalanceAfter: wallet.paidCredits + wallet.bonusCredits - wallet.reservedCredits,
    projectId: req.projectId ?? null,
  };
}
