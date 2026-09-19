/**
 * Credits & billing read models (PRD §144–145). User-safe by construction.
 */
import { getDb } from "../db/client.js";
import { creditTransactions, plans, subscriptions } from "../db/schema.js";
import { and, desc, eq, lt } from "drizzle-orm";
import { getWalletState } from "../credits/wallet.js";
import { DEFAULT_CREDIT_PACKS, DEFAULT_PLANS } from "../config.js";
import type { BillingDto, PlanDto, TransactionListResponse, WalletDto } from "@rendervid/shared";
import { isStripeConfigured } from "../billing/stripe.js";

export function walletToDto(w: { paidCredits: number; bonusCredits: number; reservedCredits: number }): WalletDto {
  const total = w.paidCredits + w.bonusCredits;
  return {
    paidCredits: w.paidCredits,
    bonusCredits: w.bonusCredits,
    reservedCredits: w.reservedCredits,
    availableCredits: total - w.reservedCredits,
    totalCredits: total,
  };
}

export async function listTransactions(
  userId: string,
  opts: { cursor?: string; limit?: number } = {},
): Promise<TransactionListResponse> {
  const db = getDb();
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
  const conditions = [eq(creditTransactions.userId, userId)];
  if (opts.cursor) {
    const d = new Date(opts.cursor);
    if (!Number.isNaN(d.getTime())) conditions.push(lt(creditTransactions.createdAt, d));
  }
  const rows = await db
    .select()
    .from(creditTransactions)
    .where(and(...conditions))
    .orderBy(desc(creditTransactions.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return {
    items: page.map((t) => ({
      id: t.id,
      type: t.type,
      pool: t.pool,
      amount: t.amount,
      balanceAfter: t.paidBalanceAfter + t.bonusBalanceAfter,
      description: t.description,
      generationId: t.generationId,
      createdAt: t.createdAt.toISOString(),
    })),
    nextCursor: hasMore ? page[page.length - 1]!.createdAt.toISOString() : null,
  };
}

export async function listPlans(currentPlanId: string | null): Promise<PlanDto[]> {
  const db = getDb();
  const rows = await db.select().from(plans).where(eq(plans.active, true)).orderBy(plans.sortOrder);
  const source = rows.length > 0 ? rows : DEFAULT_PLANS.map((p) => ({ ...p, current: false }));
  return source.map((p) => ({
    id: p.id as PlanDto["id"],
    name: p.name,
    monthlyPriceUsdCents: p.monthlyPriceUsdCents,
    monthlyCredits: p.monthlyCredits,
    features: p.features,
    current: currentPlanId === p.id,
  }));
}

export async function getBillingDto(userId: string, currentPlanId: string | null): Promise<BillingDto> {
  const wallet = await getWalletState(userId);
  return {
    plan: (await listPlans(currentPlanId)).find((p) => p.current) ?? null,
    wallet: walletToDto(wallet),
    stripePortalUrl: null, // generated on demand via POST /api/billing/portal
    autoTopUpEnabled: false,
  };
}

export function creditPacks() {
  return DEFAULT_CREDIT_PACKS;
}
