import { NextRequest } from "next/server";
import { verifyAccessToken } from "@rendervid/core";
import { randomUUID } from "node:crypto";

export async function requireUserOptional(req: NextRequest): Promise<{ userId: string | null; requestId: string }> {
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ")
    ? auth.slice(7)
    : req.cookies.get("rv-access")?.value ?? null;
  if (!token) return { userId: null, requestId: randomUUID() };
  try {
    const ctx = await verifyAccessToken(token);
    return { userId: ctx.userId, requestId: randomUUID() };
  } catch {
    return { userId: null, requestId: randomUUID() };
  }
}
