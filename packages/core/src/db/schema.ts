/**
 * RenderVid Phase 1 schema.
 * Conventions:
 * - uuid PKs (gen_random_uuid())
 * - created_at/updated_at timestamptz defaults
 * - money = integer micro-USD; credits = integers
 * - ledger is append-only; generations carry price snapshots; provider costs are versioned
 */
import {
  pgTable,
  text,
  timestamp,
  integer,
  bigint,
  boolean,
  jsonb,
  uniqueIndex,
  index,
  uuid,
  pgEnum,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

export const generationStatusEnum = pgEnum("generation_status", [
  "created",
  "credits_reserved",
  "queued",
  "submitted",
  "processing",
  "succeeded",
  "failed",
  "canceled",
  "refunding",
  "refunded",
]);

export const creditTxTypeEnum = pgEnum("credit_tx_type", [
  "PURCHASE",
  "SUBSCRIPTION",
  "GENERATION_RESERVATION",
  "GENERATION_CHARGE",
  "GENERATION_REFUND",
  "BONUS",
  "ADMIN_ADJUSTMENT",
  "PROMOTION",
  "EXPIRATION",
]);

export const creditPoolEnum = pgEnum("credit_pool", ["paid", "bonus"]);

export const assetTypeEnum = pgEnum("asset_type", [
  "image",
  "video",
  "audio",
  "document",
  "thumbnail",
]);

export const jobStatusEnum = pgEnum("job_status", [
  "pending",
  "submitted",
  "polling",
  "succeeded",
  "failed",
  "canceled",
]);

/* ------------------------------------------------------------------ */
/* Identity                                                            */
/* ------------------------------------------------------------------ */

/** Mirrors auth.users in Supabase (id = auth user id). */
export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Local dev-mode credentials (ONLY used when auth runs without Supabase —
 * see packages/core/src/auth/dev-auth.ts). Never used in production, where
 * identity lives in Supabase Auth.
 */
export const devCredentials = pgTable("dev_credentials", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const profiles = pgTable("profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
  creatorType: text("creator_type"),
  interests: jsonb("interests").$type<string[]>().notNull().default([]),
  /** Free plan watermark flag — derived from plan but materialized for speed. */
  watermarkEnabled: boolean("watermark_enabled").notNull().default(true),
  stripeCustomerId: text("stripe_customer_id"),
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Billing configuration                                               */
/* ------------------------------------------------------------------ */

export const plans = pgTable("plans", {
  id: text("id").primaryKey(), // free | creator | pro | studio | agency
  name: text("name").notNull(),
  monthlyPriceUsdCents: integer("monthly_price_usd_cents").notNull(),
  monthlyCredits: integer("monthly_credits").notNull(),
  features: jsonb("features").$type<string[]>().notNull().default([]),
  watermarkEnabled: boolean("watermark_enabled").notNull().default(true),
  stripePriceId: text("stripe_price_id"),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const creditConfig = pgTable("credit_config", {
  id: text("id").primaryKey().default("default"),
  microUsdPerCredit: bigint("micro_usd_per_credit", { mode: "number" }).notNull(),
  markupBp: integer("markup_bp").notNull(),
  roundingUnitCredits: integer("rounding_unit_credits").notNull(),
  minGenerationCredits: integer("min_generation_credits").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id),
    status: text("status").notNull(), // stripe subscription status
    stripeSubscriptionId: text("stripe_subscription_id").notNull(),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("subscriptions_stripe_id_key").on(t.stripeSubscriptionId),
    index("subscriptions_user_idx").on(t.userId),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    kind: text("kind").notNull(), // credits | subscription
    amountUsdCents: integer("amount_usd_cents").notNull(),
    currency: text("currency").notNull().default("usd"),
    status: text("status").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("payments_checkout_session_key").on(t.stripeCheckoutSessionId),
    index("payments_user_idx").on(t.userId),
  ],
);

/* ------------------------------------------------------------------ */
/* Wallet & ledger                                                     */
/* ------------------------------------------------------------------ */

export const creditWallets = pgTable("credit_wallets", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  paidCredits: integer("paid_credits").notNull().default(0),
  bonusCredits: integer("bonus_credits").notNull().default(0),
  reservedCredits: integer("reserved_credits").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  /** Guard: never allow negative balances (belt-and-braces with app checks). */
  paidNonNegative: boolean("paid_non_negative").notNull().default(true),
});

export type CreditTransaction = typeof creditTransactions.$inferSelect;

export const creditTransactions = pgTable(
  "credit_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: creditTxTypeEnum("type").notNull(),
    pool: creditPoolEnum("pool").notNull(),
    /** Signed: positive grants, negative reservations/consumption. */
    amount: integer("amount").notNull(),
    paidBalanceAfter: integer("paid_balance_after").notNull(),
    bonusBalanceAfter: integer("bonus_balance_after").notNull(),
    reservedBalanceAfter: integer("reserved_balance_after").notNull().default(0),
    description: text("description").notNull(),
    generationId: uuid("generation_id"),
    /** Deduplication key for external events (Stripe event id, provider job id + kind). */
    dedupeKey: text("dedupe_key"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("credit_tx_dedupe_key").on(t.dedupeKey),
    index("credit_tx_user_created_idx").on(t.userId, t.createdAt),
    index("credit_tx_generation_idx").on(t.generationId),
  ],
);

/* ------------------------------------------------------------------ */
/* Projects & assets                                                   */
/* ------------------------------------------------------------------ */

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("projects_user_idx").on(t.userId)],
);

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    type: assetTypeEnum("type").notNull(),
    mimeType: text("mime_type").notNull(),
    /** R2/local object key; never a raw bucket URL. */
    storageKey: text("storage_key").notNull(),
    width: integer("width"),
    height: integer("height"),
    durationMs: integer("duration_ms"),
    fileSize: bigint("file_size", { mode: "number" }),
    thumbnailStorageKey: text("thumbnail_storage_key"),
    source: text("source").notNull().default("generation"), // generation | upload
    generationId: uuid("generation_id"),
    favorite: boolean("favorite").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("assets_user_idx").on(t.userId, t.createdAt),
    index("assets_project_idx").on(t.projectId),
    index("assets_generation_idx").on(t.generationId),
  ],
);

/* ------------------------------------------------------------------ */
/* Model registry & provider pricing (internal only — never user-facing) */
/* ------------------------------------------------------------------ */

export const models = pgTable(
  "models",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(), // higgsfield | mock
    providerModelId: text("provider_model_id").notNull(),
    /** Internal only. Never sent to clients. */
    displayNameInternal: text("display_name_internal").notNull(),
    capability: text("capability").notNull(),
    mediaType: text("media_type").notNull(), // image | video
    endpointPath: text("endpoint_path").notNull(),
    supportsImageInput: boolean("supports_image_input").notNull().default(false),
    supportsAudio: boolean("supports_audio").notNull().default(false),
    supportedDurations: jsonb("supported_durations").$type<number[]>().notNull().default([]),
    qualityScore: integer("quality_score").notNull(), // 0-100
    speedScore: integer("speed_score").notNull(), // 0-100
    reliabilityScore: integer("reliability_score").notNull(), // 0-100
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("models_provider_model_key").on(t.provider, t.providerModelId),
    index("models_capability_idx").on(t.capability),
  ],
);

/** Versioned provider price rows — never overwrite; close old row, insert new. */
export const providerCosts = pgTable(
  "provider_costs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    providerModelId: text("provider_model_id").notNull(),
    costType: text("cost_type").notNull(), // per_image | per_second | per_megapixel
    /** Integer micro-USD. */
    costMicroUsd: bigint("cost_micro_usd", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("usd"),
    source: text("source").notNull().default("manual"),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
    effectiveUntil: timestamp("effective_until", { withTimezone: true }),
    active: boolean("active").notNull().default(true),
  },
  (t) => [index("provider_costs_lookup_idx").on(t.provider, t.providerModelId, t.active)],
);

/* ------------------------------------------------------------------ */
/* Generations                                                         */
/* ------------------------------------------------------------------ */

export const generations = pgTable(
  "generations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    status: generationStatusEnum("status").notNull().default("created"),
    prompt: text("prompt").notNull(),
    normalizedPrompt: text("normalized_prompt").notNull(),
    mode: text("mode").notNull(), // auto | quality | economy
    /** AI Director plan (validated JSON). Contains capabilities, not model names. */
    directorPlan: jsonb("director_plan").$type<Record<string, unknown>>(),
    /** Capability chosen by the router. Internal-safe but not secret. */
    capability: text("capability").notNull(),
    /** FKless here to keep this table hot; verified in code. */
    modelId: uuid("model_id"),
    contentType: text("content_type").notNull(),
    quality: text("quality").notNull(),
    durationSeconds: integer("duration_seconds"),
    aspectRatio: text("aspect_ratio"),
    inputAssetIds: jsonb("input_asset_ids").$type<string[]>().notNull().default([]),

    // price snapshots (PRD §65) — frozen at creation
    providerCostEstimateMicros: bigint("provider_cost_estimate_micros", { mode: "number" }).notNull(),
    providerPriceSnapshot: jsonb("provider_price_snapshot").$type<Record<string, unknown>>().notNull(),
    customerPriceSnapshot: jsonb("customer_price_snapshot").$type<Record<string, unknown>>().notNull(),
    creditPriceSnapshot: jsonb("credit_price_snapshot").$type<Record<string, unknown>>().notNull(),
    estimatedCredits: integer("estimated_credits").notNull(),
    reservedCredits: integer("reserved_credits").notNull().default(0),
    chargedCredits: integer("charged_credits"),
    refundedCredits: integer("refunded_credits"),

    provider: text("provider").notNull(),
    providerRequestId: text("provider_request_id"),
    providerStatus: text("provider_status"),
    errorcode: text("error_code"),
    errorMessage: text("error_message"),
    failureMessage: text("failure_message"),
    retryCount: integer("retry_count").notNull().default(0),

    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("generations_user_idem_key").on(t.userId, t.idempotencyKey),
    index("generations_user_created_idx").on(t.userId, t.createdAt),
    index("generations_status_idx").on(t.status),
    index("generations_provider_request_idx").on(t.provider, t.providerRequestId),
  ],
);

export const generationJobs = pgTable(
  "generation_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    generationId: uuid("generation_id")
      .notNull()
      .references(() => generations.id, { onDelete: "cascade" }),
    attempt: integer("attempt").notNull().default(1),
    status: jobStatusEnum("status").notNull().default("pending"),
    providerRequestId: text("provider_request_id"),
    statusUrl: text("status_url"),
    cancelUrl: text("cancel_url"),
    lastPolledAt: timestamp("last_polled_at", { withTimezone: true }),
    nextPollAt: timestamp("next_poll_at", { withTimezone: true }),
    outputs: jsonb("outputs").$type<Record<string, unknown>>(),
    errorcode: text("error_code"),
    errorMessage: text("error_message"),
    retryable: boolean("retryable"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("generation_jobs_generation_idx").on(t.generationId),
    index("generation_jobs_next_poll_idx").on(t.status, t.nextPollAt),
  ],
);

/* ------------------------------------------------------------------ */
/* Idempotency, audit, usage                                           */
/* ------------------------------------------------------------------ */

/** Generic idempotency store for POSTs (stripe webhooks use ledger dedupe keys). */
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    key: text("key").primaryKey(),
    scope: text("scope").notNull(),
    userId: uuid("user_id"),
    responseBody: jsonb("response_body").$type<unknown>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idempotency_user_idx").on(t.userId)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actor: text("actor").notNull(), // user id, "system", "admin:<id>"
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_action_idx").on(t.action, t.createdAt)],
);

export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id"),
    event: text("event").notNull(),
    generationId: uuid("generation_id"),
    properties: jsonb("properties").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("usage_events_user_idx").on(t.userId, t.createdAt)],
);
