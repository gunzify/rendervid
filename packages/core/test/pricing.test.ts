import { describe, expect, it } from "vitest";
import { calculateCredits, roundUpToUnit } from "../src/pricing/pricing.js";
import { DEFAULT_PRICING } from "../src/config.js";

const cfg = { ...DEFAULT_PRICING };

describe("pricing engine", () => {
  it("applies the 2.5x markup and converts to credits", () => {
    // $1.12 → $2.80 → 419.79 credits → 420 rounded to unit 5.
    const { credits, customerPriceMicros } = calculateCredits(1_120_000, cfg);
    expect(customerPriceMicros).toBe(2_800_000);
    expect(credits).toBe(420);
  });

  it("enforces the minimum charge floor", () => {
    const { credits } = calculateCredits(100, cfg); // tiny provider cost
    expect(credits).toBeGreaterThanOrEqual(cfg.minGenerationCredits);
  });

  it("rounds up to the configured unit, never down", () => {
    expect(roundUpToUnit(421, 5)).toBe(425);
    expect(roundUpToUnit(425, 5)).toBe(425);
    expect(roundUpToUnit(426, 5)).toBe(430);
  });
});
