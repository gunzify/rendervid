/**
 * Pricing engine (PRD §16–19, §64–65).
 *
 * provider cost (micro-USD) ──× markupBp──▶ customer USD ──÷ microUsdPerCredit──▶ credits
 *
 * Pure functions + a config loader. NO model names, NO hardcoded rates.
 * The AI Director never touches this; this module is the only authority on money.
 */
import { getDb } from "../db/client.js";
import { creditConfig } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { DEFAULT_PRICING } from "../config.js";

export interface PricingConfig {
  microUsdPerCredit: number;
  markupBp: number;
  roundingUnitCredits: number;
  minGenerationCredits: number;
}

export async function getPricingConfig(): Promise<PricingConfig> {
  const db = getDb();
  const rows = await db.select().from(creditConfig).where(eq(creditConfig.id, "default")).limit(1);
  const row = rows[0];
  if (!row) return { ...DEFAULT_PRICING };
  return {
    microUsdPerCredit: row.microUsdPerCredit,
    markupBp: row.markupBp,
    roundingUnitCredits: row.roundingUnitCredits,
    minGenerationCredits: row.minGenerationCredits,
  };
}

export interface PriceBreakdown {
  providerCostMicros: number;
  customerPriceMicros: number;
  /** Price before minimum-charge and rounding floors. */
  rawCredits: number;
  /** Final user-facing credits (integers, rounded UP — never in the customer's favor). */
  credits: number;
  config: PricingConfig;
  /** Frozen copies for snapshotting onto the generation row (PRD §65). */
  snapshots: {
    provider: Record<string, unknown>;
    customer: Record<string, unknown>;
    credit: Record<string, unknown>;
  };
}

/** Round credits up to the configured unit (e.g. unit 5 → 423 → 425). */
export function roundUpToUnit(credits: number, unit: number): number {
  if (unit <= 1) return Math.ceil(credits);
  return Math.ceil(credits / unit) * unit;
}

export function calculateCredits(
  providerCostMicros: number,
  config: PricingConfig,
): { customerPriceMicros: number; credits: number } {
  if (providerCostMicros < 0) throw new Error("provider cost cannot be negative");
  const customerPriceMicros = Math.ceil((providerCostMicros * config.markupBp) / 10_000);
  const rawCredits = customerPriceMicros / config.microUsdPerCredit;
  const rounded = roundUpToUnit(rawCredits, config.roundingUnitCredits);
  const credits = Math.max(config.minGenerationCredits, rounded);
  return { customerPriceMicros, credits };
}

export function buildBreakdown(
  providerCostMicros: number,
  config: PricingConfig,
): PriceBreakdown {
  const { customerPriceMicros, credits } = calculateCredits(providerCostMicros, config);
  return {
    providerCostMicros,
    customerPriceMicros,
    rawCredits: customerPriceMicros / config.microUsdPerCredit,
    credits,
    config,
    snapshots: {
      provider: {
        providerCostMicros,
        capturedAt: new Date().toISOString(),
      },
      customer: {
        customerPriceMicros,
        markupBp: config.markupBp,
        capturedAt: new Date().toISOString(),
      },
      credit: {
        estimatedCredits: credits,
        microUsdPerCredit: config.microUsdPerCredit,
        roundingUnitCredits: config.roundingUnitCredits,
        minGenerationCredits: config.minGenerationCredits,
        capturedAt: new Date().toISOString(),
      },
    },
  };
}
