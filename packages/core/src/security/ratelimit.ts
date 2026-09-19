/**
 * Rate limiting (PRD §74). In-memory sliding window; sufficient for single-instance
 * Phase 1. Interface is async so a Redis backend can drop in later.
 */
import { getDb } from "../db/client.js";
import { generations } from "../db/schema.js";
import { and, gte, eq, count } from "drizzle-orm";
import { DomainError } from "../credits/errors.js";

const WINDOW_MS = 60 * 60 * 1000; // 1 hour

const HOURLY_LIMITS: Record<string, number> = {
  free: 6,
  creator: 30,
  pro: 80,
  studio: 200,
  agency: 400,
};

export async function assertWithinGenerationQuota(userId: string, planId: string): Promise<void> {
  const db = getDb();
  const since = new Date(Date.now() - WINDOW_MS);
  const rows = await db
    .select({ n: count() })
    .from(generations)
    .where(and(eq(generations.userId, userId), gte(generations.createdAt, since)));
  const used = rows[0]?.n ?? 0;
  const limit = HOURLY_LIMITS[planId] ?? 6;
  if (used >= limit) {
    throw new DomainError(
      "rate_limited",
      "You've reached your hourly creation limit. It resets shortly.",
      "Upgrade your plan for higher limits.",
    );
  }
}

/** Simple in-memory fixed-window limiter for sensitive endpoints (auth, billing). */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function assertRateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  b.count += 1;
  if (b.count > limit) {
    throw new DomainError("rate_limited", "Too many requests. Please slow down.");
  }
}
