import type { CreditPackDto, PlanDto } from "@rendervid/shared";

/**
 * BUSINESS CONFIG — the knobs the PRD says must never be hardcoded in frontend
 * or scattered in business logic. Seeded into `credit_config` and `plans`.
 */

export const DEFAULT_PRICING = {
  /** 1 credit = $0.00667 → ~150 credits per USD. */
  microUsdPerCredit: 6_670,
  /** 2.5x provider cost = 25_000 bp. */
  markupBp: 25_000,
  /** Customer-facing estimates round up to this many credits. */
  roundingUnitCredits: 5,
  /** No generation charges fewer credits than this. */
  minGenerationCredits: 50,
} as const;

export const DEFAULT_PLANS: Array<Omit<PlanDto, "current"> & { stripePriceEnv?: string; sortOrder: number }> = [
  {
    id: "free",
    name: "Free",
    monthlyPriceUsdCents: 0,
    monthlyCredits: 100,
    sortOrder: 0,
    features: [
      "100 bonus credits to start",
      "Standard quality",
      "Watermarked results",
      "1 GB storage",
      "Community support",
    ],
  },
  {
    id: "creator",
    name: "Creator",
    monthlyPriceUsdCents: 1900,
    monthlyCredits: 2000,
    sortOrder: 1,
    features: [
      "2,000 credits / month",
      "No watermark",
      "Commercial use",
      "Unlimited projects",
      "Asset library & templates",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    monthlyPriceUsdCents: 4900,
    monthlyCredits: 6000,
    sortOrder: 2,
    features: [
      "6,000 credits / month",
      "Priority generation",
      "Maximum quality mode",
      "Brand kit basics",
      "100 GB storage",
    ],
  },
  {
    id: "studio",
    name: "Studio",
    monthlyPriceUsdCents: 9900,
    monthlyCredits: 15000,
    sortOrder: 3,
    features: [
      "15,000 credits / month",
      "Team workspace",
      "Campaign workflows",
      "Priority queue",
      "500 GB storage",
    ],
  },
  {
    id: "agency",
    name: "Agency",
    monthlyPriceUsdCents: 24900,
    monthlyCredits: 40000,
    sortOrder: 4,
    features: [
      "40,000 credits / month",
      "Multiple workspaces",
      "Client management",
      "Usage analytics",
      "2 TB storage",
    ],
  },
];

/**
 * Credit packs. Face value of (credits + bonus) ≈ price keeps marketing honest,
 * while the 2.5x markup engine keeps gross contribution positive either way.
 */
export const DEFAULT_CREDIT_PACKS: Array<Omit<CreditPackDto, never>> = [
  { id: "pack-1000", name: "Starter", credits: 1000, bonusCredits: 0, priceUsdCents: 1000 },
  { id: "pack-2750", name: "Plus", credits: 2750, bonusCredits: 250, priceUsdCents: 2500 },
  { id: "pack-6000", name: "Pro Pack", credits: 6000, bonusCredits: 750, priceUsdCents: 5000 },
  { id: "pack-13000", name: "Studio Pack", credits: 13000, bonusCredits: 2000, priceUsdCents: 10000 },
  { id: "pack-35000", name: "Agency Pack", credits: 35000, bonusCredits: 6000, priceUsdCents: 25000 },
];

/** Consumption policy: bonus credits are spent before paid credits (configurable). */
export const POOL_CONSUMPTION_ORDER: Array<"bonus" | "paid"> = ["bonus", "paid"];

/** Mode → router scoring weights (PRD §14/§15). Sums to 1.0 per mode. */
export const MODE_WEIGHTS: Record<
  "auto" | "quality" | "economy",
  { taskFit: number; quality: number; reliability: number; speed: number; cost: number }
> = {
  auto: { taskFit: 0.35, quality: 0.25, reliability: 0.2, speed: 0.1, cost: 0.1 },
  quality: { taskFit: 0.3, quality: 0.45, reliability: 0.2, speed: 0.02, cost: 0.03 },
  economy: { taskFit: 0.3, quality: 0.08, reliability: 0.17, speed: 0.2, cost: 0.25 },
};

/** Minimum acceptable quality score per mode; router rejects candidates below it. */
export const MODE_QUALITY_FLOOR: Record<"auto" | "quality" | "economy", number> = {
  auto: 55,
  quality: 75,
  economy: 35,
};
