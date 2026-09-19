/**
 * Auth service: verification, user provisioning, plan resolution.
 * The signup/signin HTTP calls live in supabase-auth.ts.
 */
import { createRemoteJWKSet, jwtVerify } from "jose";
import { getDb } from "../db/client.js";
import { users, profiles, creditWallets, plans, subscriptions } from "../db/schema.js";
import { eq, and, desc } from "drizzle-orm";
import { env } from "../env.js";
import { grantCreditsTx } from "../credits/wallet.js";
import { audit, trackEvent } from "../security/audit.js";
import type { AuthSession } from "@rendervid/shared";

/* ------------------------------------------------------------------ */
/* JWT verification                                                    */
/* ------------------------------------------------------------------ */

import { createHmac } from "node:crypto";

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

export interface AuthContext {
  userId: string;
  email: string;
}

export async function verifyAccessToken(token: string): Promise<AuthContext> {
  const cfg = env.supabase();

  // Dev fallback: HS256 tokens signed with SUPABASE_JWT_SECRET (self-hosted Supabase
  // and local emulators use this instead of JWKS endpoints).
  const devSecret = process.env.SUPABASE_JWT_SECRET ?? (!cfg.url ? env.appSecret() : undefined);
  if (devSecret) {
    const key = new TextEncoder().encode(devSecret);
    const issuer = cfg.url ? `${cfg.url.replace(/\/$/, "")}/auth/v1` : undefined;
    const { payload } = await jwtVerify(token, key, issuer ? { issuer } : {});
    if (!payload.sub) throw new Error("Invalid token: missing subject");
    return { userId: payload.sub, email: typeof payload.email === "string" ? payload.email : "" };
  }

  if (!cfg.url || !cfg.anonKey) {
    throw new Error("Auth is not configured (SUPABASE_URL / SUPABASE_ANON_KEY).");
  }
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${cfg.url.replace(/\/$/, "")}/auth/v1/.well-known/jwks.json`));
  }
  const { payload } = await jwtVerify(token, jwks, {
    issuer: `${cfg.url.replace(/\/$/, "")}/auth/v1`,
  });
  const sub = payload.sub;
  if (!sub) throw new Error("Invalid token: missing subject");
  return { userId: sub, email: typeof payload.email === "string" ? payload.email : "" };
}

/* ------------------------------------------------------------------ */
/* Provisioning                                                        */
/* ------------------------------------------------------------------ */

export interface LocalUser {
  userId: string;
  email: string;
  displayName: string;
  onboardingCompleted: boolean;
  watermarkEnabled: boolean;
  isAdmin: boolean;
}

export async function ensureLocalUser(su: {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}): Promise<LocalUser> {
  const db = getDb();

  const existingProfile = await db.select().from(profiles).where(eq(profiles.userId, su.id)).limit(1);
  if (existingProfile[0]) {
    const p = existingProfile[0];
    return {
      userId: su.id,
      email: su.email ?? "",
      displayName: p.displayName,
      onboardingCompleted: p.onboardingCompleted,
      watermarkEnabled: p.watermarkEnabled,
      isAdmin: p.isAdmin,
    };
  }

  const email = su.email ?? "";
  const displayName =
    (su.user_metadata?.display_name as string | undefined) ?? email.split("@")[0] ?? "Creator";

  await db.transaction(async (tx) => {
    await tx.insert(users).values({ id: su.id, email }).onConflictDoNothing();
    await tx.insert(profiles).values({ userId: su.id, displayName }).onConflictDoNothing();
    await tx.insert(creditWallets).values({ userId: su.id }).onConflictDoNothing();

    // Welcome bonus: 100 bonus credits (PRD §24) — dedupeKey makes replays impossible.
    await grantCreditsTx(tx, {
      userId: su.id,
      amount: 100,
      pool: "bonus",
      type: "BONUS",
      description: "Welcome bonus credits",
      dedupeKey: `welcome:${su.id}`,
    });
  });

  await audit({ actor: su.id, action: "user_provisioned", targetType: "user", targetId: su.id });
  await trackEvent(su.id, "signup");
  return {
    userId: su.id,
    email,
    displayName,
    onboardingCompleted: false,
    watermarkEnabled: true,
    isAdmin: false,
  };
}

export async function getProfile(userId: string): Promise<LocalUser | null> {
  const db = getDb();
  const rows = await db
    .select({ u: users, p: profiles })
    .from(users)
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    userId: row.u.id,
    email: row.u.email,
    displayName: row.p.displayName,
    onboardingCompleted: row.p.onboardingCompleted,
    watermarkEnabled: row.p.watermarkEnabled,
    isAdmin: row.p.isAdmin,
  };
}

/* ------------------------------------------------------------------ */
/* Plan resolution                                                     */
/* ------------------------------------------------------------------ */

export interface ResolvedPlan {
  planId: string;
  watermarkEnabled: boolean;
  hasActiveSubscription: boolean;
  monthlyCredits: number;
}

export async function resolvePlan(userId: string): Promise<ResolvedPlan> {
  const db = getDb();
  const subRows = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);

  const sub = subRows[0];
  if (sub) {
    const planRows = await db.select().from(plans).where(eq(plans.id, sub.planId)).limit(1);
    const plan = planRows[0];
    if (plan) {
      return {
        planId: plan.id,
        watermarkEnabled: plan.watermarkEnabled,
        hasActiveSubscription: true,
        monthlyCredits: plan.monthlyCredits,
      };
    }
  }
  return { planId: "free", watermarkEnabled: true, hasActiveSubscription: false, monthlyCredits: 100 };
}

/* ------------------------------------------------------------------ */
/* Session mapping                                                     */
/* ------------------------------------------------------------------ */

export function toAuthSession(
  s: { access_token: string; refresh_token: string; expires_at: number; user: { id: string; email?: string; user_metadata?: Record<string, unknown> } },
  local: LocalUser,
): AuthSession {
  return {
    accessToken: s.access_token,
    refreshToken: s.refresh_token,
    expiresAt: s.expires_at,
    user: {
      id: local.userId,
      email: local.email || s.user.email || "",
      displayName: local.displayName,
      onboardingCompleted: local.onboardingCompleted,
    },
  };
}
