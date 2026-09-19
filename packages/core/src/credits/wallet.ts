/**
 * Credit wallet service (PRD §20–22, §120).
 *
 * All mutations run inside one DB transaction, row-locking the wallet.
 * The ledger is append-only: corrections are NEW rows, never edits.
 * Every financial event carries a dedupeKey so retries and webhook replays are no-ops.
 */
import { getDb, type DB } from "../db/client.js";
import { creditWallets, creditTransactions, type CreditTransaction } from "../db/schema.js";
import { DomainError, InsufficientCreditsError } from "./errors.js";
import { POOL_CONSUMPTION_ORDER } from "../config.js";
import { eq } from "drizzle-orm";

export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

export interface WalletState {
  paidCredits: number;
  bonusCredits: number;
  reservedCredits: number;
}

export interface LedgerInsert {
  userId: string;
  type: CreditTransaction["type"];
  pool: CreditTransaction["pool"];
  amount: number; // signed
  description: string;
  generationId?: string | null;
  dedupeKey?: string | null;
  metadata?: Record<string, unknown> | undefined;
}

function toState(w: { paidCredits: number; bonusCredits: number; reservedCredits: number }): WalletState {
  return { paidCredits: w.paidCredits, bonusCredits: w.bonusCredits, reservedCredits: w.reservedCredits };
}

export async function getWalletState(userId: string): Promise<WalletState> {
  const db = getDb();
  const rows = await db.select().from(creditWallets).where(eq(creditWallets.userId, userId)).limit(1);
  const w = rows[0];
  if (!w) return { paidCredits: 0, bonusCredits: 0, reservedCredits: 0 };
  return toState(w);
}

/** Lock and fetch the wallet inside a transaction. */
async function lockWallet(tx: Tx, userId: string) {
  const rows = await tx
    .select()
    .from(creditWallets)
    .where(eq(creditWallets.userId, userId))
    .for("update")
    .limit(1);
  const wallet = rows[0];
  if (!wallet) throw new DomainError("not_found", "Wallet not found");
  return wallet;
}

/** Returns the existing ledger row if dedupeKey was already processed. */
async function findDedupe(tx: Tx, dedupeKey: string | null | undefined): Promise<CreditTransaction | null> {
  if (!dedupeKey) return null;
  const rows = await tx
    .select()
    .from(creditTransactions)
    .where(eq(creditTransactions.dedupeKey, dedupeKey))
    .limit(1);
  return rows[0] ?? null;
}

async function appendLedger(tx: Tx, wallet: WalletState, entry: LedgerInsert): Promise<void> {
  await tx.insert(creditTransactions).values({
    userId: entry.userId,
    type: entry.type,
    pool: entry.pool,
    amount: entry.amount,
    paidBalanceAfter: wallet.paidCredits,
    bonusBalanceAfter: wallet.bonusCredits,
    reservedBalanceAfter: wallet.reservedCredits,
    description: entry.description,
    generationId: entry.generationId ?? null,
    dedupeKey: entry.dedupeKey ?? null,
    metadata: entry.metadata ?? {},
  });
}

/* ------------------------------------------------------------------ */
/* Reservation                                                         */
/* ------------------------------------------------------------------ */

export interface ReserveInput {
  userId: string;
  generationId: string;
  amount: number;
  dedupeKey: string;
  description: string;
}

export async function reserveCredits(input: ReserveInput): Promise<WalletState> {
  const db = getDb();
  return db.transaction(async (tx) => reserveCreditsTx(tx, input));
}

export async function reserveCreditsTx(tx: Tx, input: ReserveInput): Promise<WalletState> {
  const existing = await findDedupe(tx, input.dedupeKey);
  const wallet = await lockWallet(tx, input.userId);
  if (existing) return toState(wallet); // idempotent replay

  const available = wallet.paidCredits + wallet.bonusCredits - wallet.reservedCredits;
  if (available < input.amount) throw new InsufficientCreditsError(input.amount, available);

  const next: WalletState = { ...toState(wallet), reservedCredits: wallet.reservedCredits + input.amount };
  await tx
    .update(creditWallets)
    .set({ reservedCredits: next.reservedCredits, updatedAt: new Date() })
    .where(eq(creditWallets.userId, input.userId));

  await appendLedger(tx, next, {
    userId: input.userId,
    type: "GENERATION_RESERVATION",
    pool: "paid",
    amount: 0,
    description: input.description,
    generationId: input.generationId,
    dedupeKey: input.dedupeKey,
    metadata: { reservedAmount: input.amount },
  });
  return next;
}

/* ------------------------------------------------------------------ */
/* Consumption (success settlement)                                    */
/* ------------------------------------------------------------------ */

export interface ConsumeInput {
  userId: string;
  generationId: string;
  reservedAmount: number;
  dedupeKey: string;
  description: string;
}

/**
 * Converts a reservation into a permanent charge.
 * Deducts from pools in configured order; reduces reserved by min(reserved, amount).
 */
export async function consumeReservation(input: ConsumeInput): Promise<WalletState> {
  const db = getDb();
  return db.transaction(async (tx) => consumeReservationTx(tx, input));
}

export async function consumeReservationTx(tx: Tx, input: ConsumeInput): Promise<WalletState> {
  const existing = await findDedupe(tx, input.dedupeKey);
  const wallet = await lockWallet(tx, input.userId);
  if (existing) return toState(wallet);

  const amount = input.reservedAmount;
  let paid = wallet.paidCredits;
  let bonus = wallet.bonusCredits;
  let remaining = amount;

  for (const pool of POOL_CONSUMPTION_ORDER) {
    if (remaining <= 0) break;
    if (pool === "bonus") {
      const take = Math.min(bonus, remaining);
      bonus -= take;
      remaining -= take;
    } else {
      const take = Math.min(paid, remaining);
      paid -= take;
      remaining -= take;
    }
  }
  if (remaining > 0) {
    // Reservation guarantee violated — this should be impossible.
    throw new DomainError("internal_error", "Reserved credits missing from wallet at settlement");
  }

  const reservedAfter = Math.max(0, wallet.reservedCredits - amount);
  const next: WalletState = { paidCredits: paid, bonusCredits: bonus, reservedCredits: reservedAfter };

  await tx
    .update(creditWallets)
    .set({ paidCredits: paid, bonusCredits: bonus, reservedCredits: reservedAfter, updatedAt: new Date() })
    .where(eq(creditWallets.userId, input.userId));

  await appendLedger(tx, next, {
    userId: input.userId,
    type: "GENERATION_CHARGE",
    pool: "paid",
    amount: -amount,
    description: input.description,
    generationId: input.generationId,
    dedupeKey: input.dedupeKey,
    metadata: { chargedAmount: amount },
  });
  return next;
}

/* ------------------------------------------------------------------ */
/* Refunds (failure settlement)                                        */
/* ------------------------------------------------------------------ */

export interface RefundInput {
  userId: string;
  generationId: string;
  amount: number;
  dedupeKey: string;
  description: string;
  /** Pools the reservation was notionally taken from (informational in ledger). */
  pool?: "paid" | "bonus";
}

/** Releases a reservation hold: reserved goes down; pools are untouched (they were never deducted). */
export async function refundReservation(input: RefundInput): Promise<WalletState> {
  const db = getDb();
  return db.transaction(async (tx) => refundReservationTx(tx, input));
}

export async function refundReservationTx(tx: Tx, input: RefundInput): Promise<WalletState> {
  const existing = await findDedupe(tx, input.dedupeKey);
  const wallet = await lockWallet(tx, input.userId);
  if (existing) return toState(wallet);

  // Reservation is a HOLD, not a deduction: releasing it must not add credits to pools.
  const reservedAfter = Math.max(0, wallet.reservedCredits - input.amount);
  const next: WalletState = {
    paidCredits: wallet.paidCredits,
    bonusCredits: wallet.bonusCredits,
    reservedCredits: reservedAfter,
  };

  await tx
    .update(creditWallets)
    .set({ reservedCredits: reservedAfter, updatedAt: new Date() })
    .where(eq(creditWallets.userId, input.userId));

  await appendLedger(tx, next, {
    userId: input.userId,
    type: "GENERATION_REFUND",
    pool: input.pool ?? "paid",
    amount: input.amount,
    description: input.description,
    generationId: input.generationId,
    dedupeKey: input.dedupeKey,
    metadata: { refundedAmount: input.amount },
  });
  return next;
}

/* ------------------------------------------------------------------ */
/* Grants (purchases, subscriptions, bonuses, admin)                   */
/* ------------------------------------------------------------------ */

export interface GrantInput {
  userId: string;
  amount: number;
  pool: "paid" | "bonus";
  type: CreditTransaction["type"];
  description: string;
  dedupeKey: string;
  metadata?: Record<string, unknown>;
}

export async function grantCredits(input: GrantInput): Promise<WalletState> {
  const db = getDb();
  return db.transaction(async (tx) => grantCreditsTx(tx, input));
}

export async function grantCreditsTx(tx: Tx, input: GrantInput): Promise<WalletState> {
  const existing = await findDedupe(tx, input.dedupeKey);
  const wallet = await lockWallet(tx, input.userId);
  if (existing) return toState(wallet);

  const next: WalletState =
    input.pool === "paid"
      ? { ...toState(wallet), paidCredits: wallet.paidCredits + input.amount }
      : { ...toState(wallet), bonusCredits: wallet.bonusCredits + input.amount };

  await tx
    .update(creditWallets)
    .set({
      paidCredits: next.paidCredits,
      bonusCredits: next.bonusCredits,
      updatedAt: new Date(),
    })
    .where(eq(creditWallets.userId, input.userId));

  await appendLedger(tx, next, {
    userId: input.userId,
    type: input.type,
    pool: input.pool,
    amount: input.amount,
    description: input.description,
    dedupeKey: input.dedupeKey,
    metadata: input.metadata,
  });
  return next;
}
