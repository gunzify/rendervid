/**
 * Capability-based model router (PRD §12, §14–15, §101).
 *
 * Candidates come from the `models` table (seeded per provider), scored by
 * configurable mode weights. Users never see model names — only the mode.
 */
import { getDb } from "../db/client.js";
import { models, providerCosts } from "../db/schema.js";
import { and, eq } from "drizzle-orm";
import { MODE_WEIGHTS, MODE_QUALITY_FLOOR } from "../config.js";
import type { GenerationMode } from "@rendervid/shared";
import type { DirectorPlan } from "../director/types.js";

/* ------------------------------------------------------------------ */
/* Capabilities (internal vocabulary; never rendered to users)         */
/* ------------------------------------------------------------------ */

export const CAPABILITIES = [
  "IMAGE_STANDARD",
  "IMAGE_PREMIUM",
  "IMAGE_PRODUCT",
  "VIDEO_FAST",
  "VIDEO_STANDARD",
  "VIDEO_PREMIUM",
  "VIDEO_CINEMATIC",
  "VIDEO_IMAGE_TO_VIDEO",
  "VIDEO_ADVERTISEMENT",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

/** Maps a validated Director plan to the capability it needs. Deterministic. */
export function capabilityForPlan(plan: DirectorPlan): Capability {
  if (plan.outputType === "image") {
    if (plan.workflow === "product_shot") return "IMAGE_PRODUCT";
    return plan.quality === "standard" ? "IMAGE_STANDARD" : "IMAGE_PREMIUM";
  }
  switch (plan.workflow) {
    case "image_to_video":
      return "VIDEO_IMAGE_TO_VIDEO";
    case "advertisement":
      return "VIDEO_ADVERTISEMENT";
    case "product_shot":
    case "text_to_video":
    default:
      break;
  }
  if (plan.style.includes("cinematic") || plan.quality === "maximum") return "VIDEO_CINEMATIC";
  if (plan.quality === "standard") return "VIDEO_FAST";
  if (plan.quality === "high") return "VIDEO_STANDARD";
  return "VIDEO_PREMIUM";
}

/* ------------------------------------------------------------------ */
/* Selection                                                           */
/* ------------------------------------------------------------------ */

export interface SelectedModel {
  id: string;
  provider: string;
  providerModelId: string;
  endpointPath: string;
  capability: Capability;
  qualityScore: number;
  speedScore: number;
  reliabilityScore: number;
}

export interface ModelWithCost extends SelectedModel {
  /** Live unit price snapshot for the chosen configuration. */
  costType: "per_image" | "per_second";
  costMicroUsd: number;
}

interface RouterRow {
  id: string;
  provider: string;
  providerModelId: string;
  endpointPath: string;
  capability: string;
  qualityScore: number;
  speedScore: number;
  reliabilityScore: number;
  supportsImageInput: boolean;
  supportedDurations: number[];
  active: boolean;
}

export async function selectModel(
  plan: DirectorPlan,
  mode: GenerationMode,
  opts: { durationSeconds: number | null; hasImageInput: boolean },
): Promise<ModelWithCost> {
  const capability = capabilityForPlan(plan);
  const db = getDb();

  const candidates = (await db
    .select()
    .from(models)
    .where(and(eq(models.capability, capability), eq(models.active, true)))) as RouterRow[];

  const compatible = candidates.filter((m) => {
    if (opts.hasImageInput && !m.supportsImageInput) return false;
    if (opts.durationSeconds !== null) {
      const durations = m.supportedDurations ?? [];
      if (durations.length > 0 && !durations.includes(opts.durationSeconds)) return false;
    }
    return true;
  });

  const pool = compatible.length > 0 ? compatible : candidates;
  if (pool.length === 0) {
    throw new Error(`No active models for capability ${capability}`);
  }

  const floor = MODE_QUALITY_FLOOR[mode];
  const qualified = pool.filter((m) => m.qualityScore >= floor);
  const finalPool = qualified.length > 0 ? qualified : pool; // economy floor may relax

  const w = MODE_WEIGHTS[mode];
  // Relative cost efficiency: price per model / max price in pool → 0..100 inverted.
  const priced = await Promise.all(
    finalPool.map(async (m) => ({
      m,
      cost: await getUnitCostMicros(m.provider, m.providerModelId, opts.durationSeconds),
    })),
  );
  const maxCost = Math.max(...priced.map((p) => p.cost), 1);
  const scored = priced.map(({ m, cost }) => ({
    m,
    score:
      w.quality * m.qualityScore +
      w.reliability * m.reliabilityScore +
      w.speed * m.speedScore +
      w.cost * (100 - (cost / maxCost) * 100),
  }));
  scored.sort((a, b) => b.score - a.score);
  const winner = scored[0]!.m;

  return {
    id: winner.id,
    provider: winner.provider,
    providerModelId: winner.providerModelId,
    endpointPath: winner.endpointPath,
    capability,
    qualityScore: winner.qualityScore,
    speedScore: winner.speedScore,
    reliabilityScore: winner.reliabilityScore,
    costType: opts.durationSeconds !== null ? "per_second" : "per_image",
    costMicroUsd: priced.find((p) => p.m.id === winner.id)!.cost,
  };
}

/** Latest active provider price for a model; per-second models multiply by duration later. */
export async function getUnitCostMicros(
  provider: string,
  providerModelId: string,
  _durationSeconds: number | null,
): Promise<number> {
  const db = getDb();
  const rows = await db
    .select()
    .from(providerCosts)
    .where(
      and(
        eq(providerCosts.provider, provider),
        eq(providerCosts.providerModelId, providerModelId),
        eq(providerCosts.active, true),
      ),
    );
  if (rows.length === 0) {
    // Fail closed: a model without pricing must not be routed.
    throw new Error(`No active provider price for ${provider}/${providerModelId}`);
  }
  rows.sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime());
  return rows[0]!.costMicroUsd;
}

/** Full price for a configuration (image = unit; video = unit × seconds). */
export function priceFor(costType: "per_image" | "per_second", unitCostMicros: number, durationSeconds: number | null): number {
  if (costType === "per_second") {
    const seconds = Math.max(1, durationSeconds ?? 5);
    return unitCostMicros * seconds;
  }
  return unitCostMicros;
}
