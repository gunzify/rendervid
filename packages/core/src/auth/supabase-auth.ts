/**
 * Supabase Auth REST calls (no SDK dependency).
 */
import { env } from "../env.js";

export interface SupabaseUser {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}

export interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: SupabaseUser;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  expires_in?: number;
  user?: SupabaseUser;
  msg?: string;
  error_description?: string;
  error?: string;
}

export class AuthError extends Error {
  constructor(
    public readonly code: "bad_request" | "unauthorized" | "conflict" | "internal_error",
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

function requireConfig(): { url: string; anonKey: string } {
  const { url, anonKey } = env.supabase();
  if (!url || !anonKey) {
    throw new AuthError(
      "internal_error",
      "Auth is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY (see .env.example).",
    );
  }
  return { url, anonKey };
}

function mapError(status: number, body: TokenResponse): never {
  const msg = body.msg ?? body.error_description ?? body.error ?? "Authentication failed";
  if (status === 400 && /already|registered|exists/i.test(msg)) {
    throw new AuthError("conflict", "An account with this email already exists. Try signing in.");
  }
  if (status === 400 && /confirm/i.test(msg)) {
    throw new AuthError("bad_request", "Confirm your email first, then sign in.");
  }
  if (status === 400) {
    throw new AuthError("bad_request", msg);
  }
  if (status === 401 || /invalid login credentials/i.test(msg)) {
    throw new AuthError("unauthorized", "Invalid email or password.");
  }
  throw new AuthError("internal_error", msg);
}

export async function supabaseSignUp(input: {
  email: string;
  password: string;
  displayName: string;
}): Promise<SupabaseSession> {
  const { url, anonKey } = requireConfig();
  const res = await fetch(`${url}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      data: { display_name: input.displayName },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok) mapError(res.status, body);
  // Email confirmation enabled: Supabase returns the user but no session.
  if (!body.access_token) {
    throw new AuthError(
      "bad_request",
      "Check your inbox — confirm your email address, then sign in.",
    );
  }
  return {
    access_token: body.access_token!,
    refresh_token: body.refresh_token ?? "",
    expires_at: body.expires_at ?? Math.floor(Date.now() / 1000) + (body.expires_in ?? 3600),
    user: body.user!,
  };
}

export async function supabaseSignIn(input: { email: string; password: string }): Promise<SupabaseSession> {
  const { url, anonKey } = requireConfig();
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email: input.email, password: input.password }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !body.access_token) mapError(res.status, body);
  return {
    access_token: body.access_token!,
    refresh_token: body.refresh_token ?? "",
    expires_at: body.expires_at ?? Math.floor(Date.now() / 1000) + (body.expires_in ?? 3600),
    user: body.user!,
  };
}
