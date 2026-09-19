import { getDb } from "../db/client.js";
import { profiles } from "../db/schema.js";
import { eq } from "drizzle-orm";
import type { OnboardingUpdate } from "@rendervid/shared";

export async function completeOnboarding(userId: string, data: OnboardingUpdate): Promise<void> {
  const db = getDb();
  await db
    .update(profiles)
    .set({
      onboardingCompleted: true,
      creatorType: data.creatorType,
      interests: data.interests,
      updatedAt: new Date(),
    })
    .where(eq(profiles.userId, userId));
}
