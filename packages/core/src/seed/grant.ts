/**
 * One-off ops script: grant credits through the ledger service (auditable, deduped).
 * Usage: DATABASE_URL=... pnpm exec tsx src/seed/grant.ts <userId> <amount> <dedupeKey> [description]
 */
import "dotenv/config";
import { grantCredits } from "../credits/wallet.js";

async function main() {
  const [userId, amountRaw, dedupeKey, description] = process.argv.slice(2);
  if (!userId || !amountRaw || !dedupeKey) {
    console.error("usage: tsx src/seed/grant.ts <userId> <amount> <dedupeKey> [description]");
    process.exit(1);
  }
  const wallet = await grantCredits({
    userId,
    amount: Number(amountRaw),
    pool: "paid",
    type: "ADMIN_ADJUSTMENT",
    description: description ?? "Admin grant",
    dedupeKey,
  });
  console.log("wallet:", JSON.stringify(wallet));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
