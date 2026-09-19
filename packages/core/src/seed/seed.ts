/**
 * Seed script: plans, pricing config, and the internal model catalog.
 *
 * The default catalog is provider "mock" (works with zero keys).
 * When moving to live Higgsfield, run with --provider=higgsfield after filling
 * real endpoint paths + prices from your Higgsfield console (see README).
 */
import "dotenv/config";
import { getDb } from "../db/client.js";
import { plans, creditConfig, models, providerCosts, users, profiles, creditWallets } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { DEFAULT_PLANS, DEFAULT_PRICING } from "../config.js";

interface SeedModel {
  providerModelId: string;
  displayNameInternal: string;
  capability: string;
  mediaType: "image" | "video";
  endpointPath: string;
  supportsImageInput: boolean;
  supportedDurations: number[];
  qualityScore: number;
  speedScore: number;
  reliabilityScore: number;
  costType: "per_image" | "per_second";
  costMicroUsd: number;
}

/** Internal catalog. Scores/costs are launch hypotheses — tune via admin later. */
const MOCK_CATALOG: SeedModel[] = [
  { providerModelId: "mock-img-fast", displayNameInternal: "Mock Image Fast", capability: "IMAGE_STANDARD", mediaType: "image", endpointPath: "/mock/image/standard", supportsImageInput: false, supportedDurations: [], qualityScore: 62, speedScore: 90, reliabilityScore: 95, costType: "per_image", costMicroUsd: 8_000 },
  { providerModelId: "mock-img-premium", displayNameInternal: "Mock Image Premium", capability: "IMAGE_PREMIUM", mediaType: "image", endpointPath: "/mock/image/premium", supportsImageInput: false, supportedDurations: [], qualityScore: 88, speedScore: 60, reliabilityScore: 93, costType: "per_image", costMicroUsd: 24_000 },
  { providerModelId: "mock-img-product", displayNameInternal: "Mock Image Product", capability: "IMAGE_PRODUCT", mediaType: "image", endpointPath: "/mock/image/product", supportsImageInput: true, supportedDurations: [], qualityScore: 82, speedScore: 70, reliabilityScore: 94, costType: "per_image", costMicroUsd: 18_000 },
  { providerModelId: "mock-vid-fast", displayNameInternal: "Mock Video Fast", capability: "VIDEO_FAST", mediaType: "video", endpointPath: "/mock/video/fast", supportsImageInput: true, supportedDurations: [4, 5, 6], qualityScore: 58, speedScore: 92, reliabilityScore: 92, costType: "per_second", costMicroUsd: 30_000 },
  { providerModelId: "mock-vid-standard", displayNameInternal: "Mock Video Standard", capability: "VIDEO_STANDARD", mediaType: "video", endpointPath: "/mock/video/standard", supportsImageInput: true, supportedDurations: [4, 5, 6, 8, 10], qualityScore: 74, speedScore: 72, reliabilityScore: 90, costType: "per_second", costMicroUsd: 60_000 },
  { providerModelId: "mock-vid-premium", displayNameInternal: "Mock Video Premium", capability: "VIDEO_PREMIUM", mediaType: "video", endpointPath: "/mock/video/premium", supportsImageInput: true, supportedDurations: [4, 5, 6, 8, 10], qualityScore: 88, speedScore: 55, reliabilityScore: 90, costType: "per_second", costMicroUsd: 120_000 },
  { providerModelId: "mock-vid-cinematic", displayNameInternal: "Mock Video Cinematic", capability: "VIDEO_CINEMATIC", mediaType: "video", endpointPath: "/mock/video/cinematic", supportsImageInput: true, supportedDurations: [5, 10], qualityScore: 94, speedScore: 40, reliabilityScore: 86, costType: "per_second", costMicroUsd: 180_000 },
  { providerModelId: "mock-vid-i2v", displayNameInternal: "Mock Video Image-to-Video", capability: "VIDEO_IMAGE_TO_VIDEO", mediaType: "video", endpointPath: "/mock/video/i2v", supportsImageInput: true, supportedDurations: [4, 5, 6, 8, 10], qualityScore: 78, speedScore: 66, reliabilityScore: 89, costType: "per_second", costMicroUsd: 80_000 },
  { providerModelId: "mock-vid-ad", displayNameInternal: "Mock Video Advertisement", capability: "VIDEO_ADVERTISEMENT", mediaType: "video", endpointPath: "/mock/video/ad", supportsImageInput: true, supportedDurations: [5, 10], qualityScore: 85, speedScore: 60, reliabilityScore: 91, costType: "per_second", costMicroUsd: 110_000 },
];

async function upsertPlan(p: (typeof DEFAULT_PLANS)[number]) {
  const db = getDb();
  await db
    .insert(plans)
    .values({
      id: p.id,
      name: p.name,
      monthlyPriceUsdCents: p.monthlyPriceUsdCents,
      monthlyCredits: p.monthlyCredits,
      features: p.features,
      watermarkEnabled: p.id === "free",
      sortOrder: p.sortOrder,
      active: true,
    })
    .onConflictDoUpdate({
      target: plans.id,
      set: {
        name: p.name,
        monthlyPriceUsdCents: p.monthlyPriceUsdCents,
        monthlyCredits: p.monthlyCredits,
        features: p.features,
        sortOrder: p.sortOrder,
        updatedAt: new Date(),
      },
    });
}

async function main() {
  const db = getDb();
  const provider = process.argv.includes("--provider=higgsfield") ? "higgsfield" : "mock";
  console.log(`Seeding (provider=${provider})...`);

  for (const p of DEFAULT_PLANS) await upsertPlan(p);

  await db
    .insert(creditConfig)
    .values({ id: "default", ...DEFAULT_PRICING })
    .onConflictDoUpdate({
      target: creditConfig.id,
      set: { ...DEFAULT_PRICING, updatedAt: new Date() },
    });

  if (provider === "mock") {
    for (const m of MOCK_CATALOG) {
      const existing = await db
        .select()
        .from(models)
        .where(eq(models.providerModelId, m.providerModelId))
        .limit(1);
      if (existing[0]) continue;
      const inserted = await db
        .insert(models)
        .values({
          provider: "mock",
          providerModelId: m.providerModelId,
          displayNameInternal: m.displayNameInternal,
          capability: m.capability,
          mediaType: m.mediaType,
          endpointPath: m.endpointPath,
          supportsImageInput: m.supportsImageInput,
          supportedDurations: m.supportedDurations,
          qualityScore: m.qualityScore,
          speedScore: m.speedScore,
          reliabilityScore: m.reliabilityScore,
        })
        .returning({ id: models.id });
      await db.insert(providerCosts).values({
        provider: "mock",
        providerModelId: m.providerModelId,
        costType: m.costType,
        costMicroUsd: m.costMicroUsd,
        source: "seed",
      });
      void inserted;
    }
    console.log(`Seeded ${MOCK_CATALOG.length} mock models with pricing.`);
  } else {
    console.log(
      "Higgsfield catalog seeding requires real endpoint paths and prices from your console.",
    );
    console.log("Copy src/seed/higgsfield-catalog.example.ts, fill it in, and re-run with --provider=higgsfield.");
  }

  console.log("Seed complete.");
  await db.execute; // no-op to satisfy bundlers
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// Keep imports referenced in script context.
void users; void profiles; void creditWallets;
