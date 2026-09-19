/**
 * Session cookie helpers for page routes (API routes accept Bearer tokens).
 * We store the Supabase access token in an httpOnly cookie set by the
 * /api/auth/signin and /api/auth/signup route handlers.
 */
import { cookies } from "next/headers";

export const ACCESS_COOKIE = "rv-access";

export async function setAccessCookie(accessToken: string, expiresAtSeconds: number): Promise<void> {
  const store = await cookies();
  store.set(ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(expiresAtSeconds * 1000),
    path: "/",
  });
}

export async function clearAccessCookie(): Promise<void> {
  const store = await cookies();
  store.delete(ACCESS_COOKIE);
}
