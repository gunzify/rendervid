# RenderVid AI

**Create anything. Without knowing how.**

An AI creative production studio: customers describe an outcome; the AI Director plans it, the
capability router picks the best internal model, the pricing engine converts provider cost →
credits, and the generation engine handles reserve → generate → store → settle → refund.
Higgsfield is the first provider — not the product.

```
rendervid/
├── apps/
│   ├── web/        Next.js 15 (marketing + app + REST API)
│   └── mobile/     Expo iOS (same API, same contracts)
├── packages/
│   ├── shared/     Zod contracts + typed ApiClient (used by web AND mobile)
│   └── core/       DB schema, money engines, Director, router, providers, storage, queue
├── workers/        BullMQ generation worker (redis mode)
└── docker-compose.dev.yml   Postgres + Redis for local dev
```

## Quickstart (zero external keys required)

```bash
docker compose -f docker-compose.dev.yml up -d db
pnpm install
cp .env.example apps/web/.env          # DATABASE_URL points at localhost:5432/rendervid

pnpm --filter @rendervid/core db:push   # create tables
pnpm --filter @rendervid/core db:seed   # plans, credit config, mock model catalog

pnpm dev:web                            # web app on :3000 (jobs run inline, mock provider)
```

- `PROVIDER_MODE=mock` → full loop works with no provider account: signup → 100 welcome
  credits → estimate → create → staged progress → asset → refund on failure.
- **Auth runs in local dev mode when `SUPABASE_URL` is empty** (or `DEV_AUTH=local`):
  email/password accounts live in a local `dev_credentials` table (scrypt-hashed) and tokens
  are HS256-signed with `SUPABASE_JWT_SECRET`/`APP_SECRET`. `POST /api/credits/dev-topup`
  grants 100k paid credits for testing the paid pool. Set `SUPABASE_URL` in production and
  this switches off automatically.
- Force paths for demos/tests with prompt markers: `[fail]`, `[nsfw]`, `[flake]`, `[slow]`.
- `QUEUE_MODE=redis` + `pnpm dev:worker` moves job processing to the dedicated worker.
- End-to-end money-cycle check against a running server: `node scripts/smoke.mjs` —
  signup → wallet → estimate (leak-free breakdown) → reserve → settle → refund →
  idempotent replay → 401/404 access control.

## Money pipeline (the guarantees)

1. **Estimate** — `POST /api/generations/estimate`: Director plan → router → pricing engine.
   User-safe breakdown only (content type, quality, duration — never provider/model names).
2. **Create** — one DB transaction: moderation gate → plan → route → price (recomputed
   server-side, client estimate never trusted) → **reserve** credits → generation + job rows.
   Idempotency-Key dedupes double-clicks and app retries.
3. **Execute** — provider submit → poll (webhook fast-path + poller safety net) → outputs
   downloaded to R2/local storage → asset rows created.
4. **Settle** — success consumes the reservation (`GENERATION_CHARGE`); failure refunds it
   (`GENERATION_REFUND`) and the UI says so. Ledger is append-only with `dedupeKey`s, so
   webhook replays and retries can never double-charge or double-refund.
5. **Price snapshots** freeze provider/customer/credit prices on every generation (§65).

Automated tests (PRD §162) live in `packages/core/test/money.test.ts`:
500 − 420 succeed → 80 · fail → 500 · duplicate replays → single effect.
They run against a real Postgres: `DATABASE_URL=... pnpm --filter @rendervid/core test`.

## Going live (checklist)

1. **Database** — point `DATABASE_URL` at Supabase Postgres; run `db:push` + `db:seed`.
2. **Auth** — set `SUPABASE_URL` / `SUPABASE_ANON_KEY` (and `SUPABASE_JWT_SECRET` if your
   project uses HS256). Sign-up grants 100 welcome credits via the ledger. Setting
   `SUPABASE_URL` automatically disables local dev auth and the dev top-up endpoint.
3. **Provider (Higgsfield)** — `PROVIDER_MODE=live`, `HIGGSFIELD_API_KEY_ID` +
   `HIGGSFIELD_API_KEY_SECRET`. Then:
   - Create `packages/core/src/seed/higgsfield-catalog.ts` with real endpoint paths and
     per-model prices from your console; seed with `--provider=higgsfield`.
   - Register the webhook `https://your-domain/api/webhooks/higgsfield` (HMAC via
     `HIGGSFIELD_WEBHOOK_SECRET`, header `x-rv-signature`).
4. **Stripe** — test keys + webhook endpoint `https://your-domain/api/webhooks/stripe`
   (checkout, invoices, subscription events). Create 4 recurring prices and fill
   `STRIPE_PRICE_*`. Credits are granted **only** from verified webhooks.
5. **Storage** — `STORAGE_MODE=r2` + R2 credentials; signed URLs everywhere.
6. **Worker** — `QUEUE_MODE=redis` and run `pnpm dev:worker` (separate process/scale group).
7. **Mobile** — `EXPO_PUBLIC_API_URL=https://your-domain` then `pnpm dev:mobile`.
8. **Verify** — run the money tests against staging, then walk the §162 checklist:
   signup/login → estimate → create → success charge · forced failure → auto refund ·
   duplicate Stripe/provider webhooks → single effect · project access control.

## Configuration knobs (no hardcoding)

`packages/core/src/config.ts` — markup (2.5×), credit value ($0.00667), rounding unit,
minimum charge, mode weights, quality floors, plans, credit packs. Seeded into `credit_config`
and `plans`; the admin UI lands in Phase 2 to change them live.

## Phase 2+ (designed for, not built)

Templates, variations, brand kits, image-to-video product flows, campaigns, teams/orgs,
admin dashboard, auto top-up, share links, public API, multi-provider failover.
