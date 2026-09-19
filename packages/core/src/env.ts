/**
 * Environment access. Never import this from client bundles.
 * All values are read lazily so tests and edge runtimes can set process.env late.
 */

function str(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v !== undefined && v !== "") return v;
  if (fallback !== undefined) return fallback;
  return "";
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export const env = {
  appUrl: () => str("APP_URL", "http://localhost:3000"),

  databaseUrl: () => {
    const v = str("DATABASE_URL");
    if (!v) throw new Error("DATABASE_URL is required (Postgres/Supabase connection string)");
    return v;
  },

  supabase: () => ({
    url: str("SUPABASE_URL"),
    anonKey: str("SUPABASE_ANON_KEY"),
    serviceRoleKey: str("SUPABASE_SERVICE_ROLE_KEY"),
  }),

  queueMode: () => (str("QUEUE_MODE", "inline") === "redis" ? "redis" : "inline") as "redis" | "inline",
  redisUrl: () => str("REDIS_URL", "redis://localhost:6379"),

  providerMode: () => (str("PROVIDER_MODE", "mock") === "live" ? "live" : "mock") as "live" | "mock",
  mockLatencyMs: () => int("MOCK_LATENCY_MS", 4000),
  higgsfield: () => ({
    keyId: str("HIGGSFIELD_API_KEY_ID"),
    keySecret: str("HIGGSFIELD_API_KEY_SECRET"),
    webhookSecret: str("HIGGSFIELD_WEBHOOK_SECRET"),
    baseUrl: str("HIGGSFIELD_BASE_URL", "https://api.higgsfield.ai"),
  }),

  mistral: () => ({
    apiKey: str("MISTRAL_API_KEY"),
    model: str("MISTRAL_MODEL", "mistral-small-latest"),
  }),

  stripe: () => ({
    secretKey: str("STRIPE_SECRET_KEY"),
    webhookSecret: str("STRIPE_WEBHOOK_SECRET"),
    priceCreator: str("STRIPE_PRICE_CREATOR"),
    pricePro: str("STRIPE_PRICE_PRO"),
    priceStudio: str("STRIPE_PRICE_STUDIO"),
    priceAgency: str("STRIPE_PRICE_AGENCY"),
  }),

  storageMode: () => (str("STORAGE_MODE", "local") === "r2" ? "r2" : "local") as "local" | "r2",
  storageLocalDir: () => str("STORAGE_LOCAL_DIR", "./storage"),
  r2: () => ({
    accountId: str("R2_ACCOUNT_ID"),
    accessKeyId: str("R2_ACCESS_KEY_ID"),
    secretAccessKey: str("R2_SECRET_ACCESS_KEY"),
    bucket: str("R2_BUCKET_NAME"),
    publicBaseUrl: str("R2_PUBLIC_BASE_URL"),
  }),

  /** HMAC secret for local-storage signed URLs and estimate tokens (dev default). */
  appSecret: () => str("APP_SECRET", "dev-secret-change-me"),

  sentryDsn: () => str("SENTRY_DSN"),
  posthogKey: () => str("POSTHOG_KEY"),
};

/** Throws unless all credentials for live provider mode are present. */
export function assertLiveProviderConfigured(): void {
  const hf = env.higgsfield();
  if (!hf.keyId || !hf.keySecret) {
    throw new Error(
      "PROVIDER_MODE=live requires HIGGSFIELD_API_KEY_ID and HIGGSFIELD_API_KEY_SECRET",
    );
  }
}
