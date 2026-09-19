CREATE TYPE "public"."asset_type" AS ENUM('image', 'video', 'audio', 'document', 'thumbnail');--> statement-breakpoint
CREATE TYPE "public"."credit_pool" AS ENUM('paid', 'bonus');--> statement-breakpoint
CREATE TYPE "public"."credit_tx_type" AS ENUM('PURCHASE', 'SUBSCRIPTION', 'GENERATION_RESERVATION', 'GENERATION_CHARGE', 'GENERATION_REFUND', 'BONUS', 'ADMIN_ADJUSTMENT', 'PROMOTION', 'EXPIRATION');--> statement-breakpoint
CREATE TYPE "public"."generation_status" AS ENUM('created', 'credits_reserved', 'queued', 'submitted', 'processing', 'succeeded', 'failed', 'canceled', 'refunding', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('pending', 'submitted', 'polling', 'succeeded', 'failed', 'canceled');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid,
	"type" "asset_type" NOT NULL,
	"mime_type" text NOT NULL,
	"storage_key" text NOT NULL,
	"width" integer,
	"height" integer,
	"duration_ms" integer,
	"file_size" bigint,
	"thumbnail_storage_key" text,
	"source" text DEFAULT 'generation' NOT NULL,
	"generation_id" uuid,
	"favorite" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "credit_config" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"micro_usd_per_credit" bigint NOT NULL,
	"markup_bp" integer NOT NULL,
	"rounding_unit_credits" integer NOT NULL,
	"min_generation_credits" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "credit_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "credit_tx_type" NOT NULL,
	"pool" "credit_pool" NOT NULL,
	"amount" integer NOT NULL,
	"paid_balance_after" integer NOT NULL,
	"bonus_balance_after" integer NOT NULL,
	"reserved_balance_after" integer DEFAULT 0 NOT NULL,
	"description" text NOT NULL,
	"generation_id" uuid,
	"dedupe_key" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "credit_wallets" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"paid_credits" integer DEFAULT 0 NOT NULL,
	"bonus_credits" integer DEFAULT 0 NOT NULL,
	"reserved_credits" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_non_negative" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "generation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"generation_id" uuid NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"provider_request_id" text,
	"status_url" text,
	"cancel_url" text,
	"last_polled_at" timestamp with time zone,
	"next_poll_at" timestamp with time zone,
	"outputs" jsonb,
	"error_code" text,
	"error_message" text,
	"retryable" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid,
	"status" "generation_status" DEFAULT 'created' NOT NULL,
	"prompt" text NOT NULL,
	"normalized_prompt" text NOT NULL,
	"mode" text NOT NULL,
	"director_plan" jsonb,
	"capability" text NOT NULL,
	"model_id" uuid,
	"content_type" text NOT NULL,
	"quality" text NOT NULL,
	"duration_seconds" integer,
	"aspect_ratio" text,
	"input_asset_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"provider_cost_estimate_micros" bigint NOT NULL,
	"provider_price_snapshot" jsonb NOT NULL,
	"customer_price_snapshot" jsonb NOT NULL,
	"credit_price_snapshot" jsonb NOT NULL,
	"estimated_credits" integer NOT NULL,
	"reserved_credits" integer DEFAULT 0 NOT NULL,
	"charged_credits" integer,
	"refunded_credits" integer,
	"provider" text NOT NULL,
	"provider_request_id" text,
	"provider_status" text,
	"error_code" text,
	"error_message" text,
	"failure_message" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "idempotency_keys" (
	"key" text PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"user_id" uuid,
	"response_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"provider_model_id" text NOT NULL,
	"display_name_internal" text NOT NULL,
	"capability" text NOT NULL,
	"media_type" text NOT NULL,
	"endpoint_path" text NOT NULL,
	"supports_image_input" boolean DEFAULT false NOT NULL,
	"supports_audio" boolean DEFAULT false NOT NULL,
	"supported_durations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"quality_score" integer NOT NULL,
	"speed_score" integer NOT NULL,
	"reliability_score" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"stripe_payment_intent_id" text,
	"stripe_checkout_session_id" text,
	"kind" text NOT NULL,
	"amount_usd_cents" integer NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"status" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"monthly_price_usd_cents" integer NOT NULL,
	"monthly_credits" integer NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"watermark_enabled" boolean DEFAULT true NOT NULL,
	"stripe_price_id" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"onboarding_completed" boolean DEFAULT false NOT NULL,
	"creator_type" text,
	"interests" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"watermark_enabled" boolean DEFAULT true NOT NULL,
	"stripe_customer_id" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "provider_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"provider_model_id" text NOT NULL,
	"cost_type" text NOT NULL,
	"cost_micro_usd" bigint NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_until" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" text NOT NULL,
	"status" text NOT NULL,
	"stripe_subscription_id" text NOT NULL,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"event" text NOT NULL,
	"generation_id" uuid,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assets" ADD CONSTRAINT "assets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assets" ADD CONSTRAINT "assets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "credit_wallets" ADD CONSTRAINT "credit_wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_generation_id_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."generations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "generations" ADD CONSTRAINT "generations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "generations" ADD CONSTRAINT "generations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assets_user_idx" ON "assets" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assets_project_idx" ON "assets" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assets_generation_idx" ON "assets" USING btree ("generation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_action_idx" ON "audit_logs" USING btree ("action","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "credit_tx_dedupe_key" ON "credit_transactions" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_tx_user_created_idx" ON "credit_transactions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_tx_generation_idx" ON "credit_transactions" USING btree ("generation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "generation_jobs_generation_idx" ON "generation_jobs" USING btree ("generation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "generation_jobs_next_poll_idx" ON "generation_jobs" USING btree ("status","next_poll_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "generations_user_idem_key" ON "generations" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "generations_user_created_idx" ON "generations" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "generations_status_idx" ON "generations" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "generations_provider_request_idx" ON "generations" USING btree ("provider","provider_request_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idempotency_user_idx" ON "idempotency_keys" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "models_provider_model_key" ON "models" USING btree ("provider","provider_model_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "models_capability_idx" ON "models" USING btree ("capability");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payments_checkout_session_key" ON "payments" USING btree ("stripe_checkout_session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_user_idx" ON "payments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_user_idx" ON "projects" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_costs_lookup_idx" ON "provider_costs" USING btree ("provider","provider_model_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_stripe_id_key" ON "subscriptions" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_user_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_events_user_idx" ON "usage_events" USING btree ("user_id","created_at");