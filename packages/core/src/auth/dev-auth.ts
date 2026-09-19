/**
 * Dev-mode authentication: lets the entire product run with ZERO external services.
 *
 * Enabled when SUPABASE_URL is unset (or DEV_AUTH=local). Credentials live in a
 * local `dev_credentials` table (scrypt-hashed). Tokens are HS256 JWTs signed with
 * SUPABASE_JWT_SECRET (or APP_SECRET) and are accepted by verifyAccessToken()'s
 * local fallback — the same path self-hosted Supabase uses.
 *
 * Never used in production: production configures Supabase and does not set
 * DEV_AUTH=local. Signin/signup routes still prefer Supabase when configured.
 */
import { randomUUID, scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { SignJWT } from "jose";
import { getDb } from "../db/client.js";
import { devCredentials, users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { env } from "../env.js";
import { AuthError, type SupabaseSession } from "./supabase-auth.js";

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export function devAuthEnabled(): boolean {
  if (process.env.DEV_AUTH === "supabase") return false;
  return !env.supabase().url || process.env.DEV_AUTH === "local";
}

function devSecret(): Uint8Array {
  return new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET ?? env.appSecret());
}

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split(":");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const hash = scryptSync(password, Buffer.from(saltHex, "hex"), 64);
  const expected = Buffer.from(hashHex, "hex");
  return hash.length === expected.length && timingSafeEqual(hash, expected);
}

async function toSession(
  userId: string,
  email: string,
  displayName: string,
): Promise<SupabaseSession> {
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const accessToken = await new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(devSecret());
  return {
    access_token: accessToken,
    refresh_token: "",
    expires_at: expiresAt,
    user: { id: userId, email, user_metadata: { display_name: displayName } },
  };
}

export async function devSignUp(input: {
  email: string;
  password: string;
  displayName: string;
}): Promise<SupabaseSession> {
  const db = getDb();
  const email = input.email.toLowerCase().trim();
  const existing = await db
    .select({ id: devCredentials.userId })
    .from(devCredentials)
    .where(eq(devCredentials.email, email))
    .limit(1);
  if (existing[0]) {
    throw new AuthError("conflict", "An account with this email already exists. Try signing in.");
  }
  const userId = randomUUID();
  // users row must exist first (dev_credentials.userId → users.id FK);
  // ensureLocalUser() then idempotently adds profile, wallet and welcome bonus.
  await db.transaction(async (tx) => {
    await tx.insert(users).values({ id: userId, email }).onConflictDoNothing();
    await tx
      .insert(devCredentials)
      .values({ userId, email, passwordHash: hashPassword(input.password) });
  });
  return toSession(userId, email, input.displayName);
}

export async function devSignIn(input: {
  email: string;
  password: string;
}): Promise<SupabaseSession> {
  const db = getDb();
  const email = input.email.toLowerCase().trim();
  const rows = await db
    .select()
    .from(devCredentials)
    .where(eq(devCredentials.email, email))
    .limit(1);
  const row = rows[0];
  if (!row || !verifyPassword(input.password, row.passwordHash)) {
    throw new AuthError("unauthorized", "Invalid email or password.");
  }
  return toSession(row.userId, row.email, "");
}
