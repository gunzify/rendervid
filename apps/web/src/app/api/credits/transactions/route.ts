import { NextRequest, NextResponse } from "next/server";
import { listTransactions } from "@rendervid/core";
import { requireUser, errorResponse } from "@/lib/api-auth";
import { randomUUID } from "node:crypto";

export async function GET(req: NextRequest) {
  const requestId = randomUUID();
  try {
    const { userId } = await requireUser(req);
    const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined;
    return NextResponse.json(await listTransactions(userId, { cursor }));
  } catch (err) {
    return errorResponse(err, requestId);
  }
}
