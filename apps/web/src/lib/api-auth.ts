/**
 * API helpers for route handlers: auth, error mapping, request-id propagation.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@rendervid/core";
import type { ApiError } from "@rendervid/shared";
import { randomUUID } from "node:crypto";

export interface RouteContext {
  userId: string;
  email: string;
  requestId: string;
}

export async function requireUser(req: NextRequest): Promise<RouteContext> {
  const auth = req.headers.get("authorization");
  let token: string | null = null;
  if (auth?.startsWith("Bearer ")) {
    token = auth.slice(7);
  } else {
    token = req.cookies.get("rv-access")?.value ?? null;
  }
  if (!token) {
    throw httpError(401, "unauthorized", "Sign in to continue.");
  }
  let ctx;
  try {
    ctx = await verifyAccessToken(token);
  } catch {
    throw httpError(401, "unauthorized", "Session expired or invalid.");
  }
  return { userId: ctx.userId, email: ctx.email, requestId: randomUUID() };
}

export function httpError(
  status: number,
  code: ApiError["error"]["code"],
  message: string,
  hint?: string,
): Error & { httpStatus?: number; apiCode?: string; hint?: string } {
  const e = new Error(message) as Error & { httpStatus?: number; apiCode?: string; hint?: string };
  e.httpStatus = status;
  e.apiCode = code;
  e.hint = hint;
  return e;
}

/** Domain error codes → HTTP status (shared contracts). */
const STATUS_BY_CODE: Record<string, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  idempotency_conflict: 409,
  insufficient_credits: 402,
  rate_limited: 429,
  moderation_rejected: 400,
  provider_unavailable: 503,
  internal_error: 500,
};

export function errorResponse(err: unknown, requestId: string): NextResponse {
  const e = err as { httpStatus?: number; code?: string; apiCode?: string; hint?: string; message?: string };
  const code = (e.apiCode ?? e.code ?? "internal_error") as ApiError["error"]["code"];
  const status = e.httpStatus ?? STATUS_BY_CODE[code] ?? 500;
  const body: ApiError = {
    error: {
      code,
      message: status === 500 ? "Something went wrong on our side." : e.message ?? "Request failed",
      hint: status === 500 ? undefined : e.hint,
      requestId,
    },
  };
  if (status === 500) console.error(`[${requestId}]`, err);
  return NextResponse.json(body, { status });
}

export async function readJson<T>(req: NextRequest): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw httpError(400, "bad_request", "Invalid JSON body");
  }
}
