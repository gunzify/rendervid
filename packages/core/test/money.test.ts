/**
 * PRD §162 — critical money tests.
 * These run against a real Postgres (DATABASE_URL). CI/local: docker compose up db.
 */
import { describe, expect, it, beforeAll, afterAll, beforeEach } from "vitest";
import { getDb } from "../src/db/client.js";
import { users, profiles, creditWallets, creditTransactions, generations, generationJobs } from "../src/db/schema.js";
import { eq } from "drizzle-orm";
import {
  reserveCredits,
  consumeReservation,
  refundReservation,
  grantCredits,
  getWalletState,
} from "../src/credits/wallet.js";
import { randomUUID } from "node:crypto";

const requiresDb = !!process.env.DATABASE_URL;
const d = requiresDb ? describe : describe.skip;

let userId: string;

beforeAll(async () => {
  if (!requiresDb) return;
  const db = getDb();
  userId = randomUUID();
  await db.insert(users).values({ id: userId, email: `test-${userId}@rendervid.test` });
  await db.insert(profiles).values({ userId, displayName: "Money Test" });
  await db.insert(creditWallets).values({ userId, paidCredits: 500, bonusCredits: 0, reservedCredits: 0 }).onConflictDoNothing();
});

/** Every test starts from a known wallet state. */
beforeEach(async () => {
  if (!requiresDb) return;
  const db = getDb();
  await db
    .update(creditWallets)
    .set({ paidCredits: 500, bonusCredits: 0, reservedCredits: 0 })
    .where(eq(creditWallets.userId, userId));
  await db.delete(creditTransactions).where(eq(creditTransactions.userId, userId));
});

afterAll(async () => {
  if (!requiresDb) return;
  const db = getDb();
  await db.delete(users).where(eq(users.id, userId));
});

d("credit lifecycle (PRD §162)", () => {
  it("charges on success: 500 − 420 = 80", async () => {
    const genId = randomUUID();
    await reserveCredits({
      userId,
      generationId: genId,
      amount: 420,
      dedupeKey: `t-reserve:${genId}`,
      description: "reserve",
    });
    const afterReserve = await getWalletState(userId);
    expect(afterReserve.reservedCredits).toBe(420);

    await consumeReservation({
      userId,
      generationId: genId,
      reservedAmount: 420,
      dedupeKey: `t-charge:${genId}`,
      description: "charge",
    });
    const after = await getWalletState(userId);
    expect(after.paidCredits).toBe(80);
    expect(after.reservedCredits).toBe(0);
  });

  it("refunds on failure: balance returns to 500", async () => {
    const genId = randomUUID();
    await reserveCredits({
      userId,
      generationId: genId,
      amount: 420,
      dedupeKey: `t-reserve:${genId}`,
      description: "reserve",
    });
    let s = await getWalletState(userId);
    expect(s.reservedCredits).toBe(420); // held, not yet deducted
    expect(s.paidCredits + s.bonusCredits - s.reservedCredits).toBe(80); // available

    await refundReservation({
      userId,
      generationId: genId,
      amount: 420,
      dedupeKey: `t-refund:${genId}`,
      description: "refund",
    });
    s = await getWalletState(userId);
    expect(s.paidCredits).toBe(500);
    expect(s.reservedCredits).toBe(0);
  });

  it("rejects reservations exceeding available balance", async () => {
    const genId = randomUUID();
    await expect(
      reserveCredits({
        userId,
        generationId: genId,
        amount: 10_000,
        dedupeKey: `t-reserve:${genId}`,
        description: "reserve",
      }),
    ).rejects.toThrow(/needs 10,?000 credits|insufficient/i);
  });

  it("is idempotent on duplicate webhook-style replays", async () => {
    const db = getDb();
    const genId = randomUUID();
    const dedupe = `t-dedupe:${genId}`;
    await reserveCredits({ userId, generationId: genId, amount: 50, dedupeKey: dedupe, description: "first" });
    await reserveCredits({ userId, generationId: genId, amount: 50, dedupeKey: dedupe, description: "replay" });
    await reserveCredits({ userId, generationId: genId, amount: 50, dedupeKey: dedupe, description: "replay 2" });

    const s = await getWalletState(userId);
    expect(s.reservedCredits).toBe(50); // reserved exactly once

    // Exactly one ledger row carries the dedupe key.
    const ledgerRows = await db
      .select()
      .from(creditTransactions)
      .where(eq(creditTransactions.dedupeKey, dedupe));
    expect(ledgerRows.length).toBe(1);
  });
});
