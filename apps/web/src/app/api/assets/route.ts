import { NextRequest, NextResponse } from "next/server";
import { listAssets } from "@rendervid/core";
import { requireUser, errorResponse } from "@/lib/api-auth";
import { randomUUID } from "node:crypto";

export async function GET(req: NextRequest) {
  const requestId = randomUUID();
  try {
    const { userId } = await requireUser(req);
    const projectId = req.nextUrl.searchParams.get("projectId") ?? undefined;
    const favorite = req.nextUrl.searchParams.get("favorite") === "true";
    const assets = await listAssets(userId, { projectId, favoriteOnly: favorite });
    return NextResponse.json(assets);
  } catch (err) {
    return errorResponse(err, requestId);
  }
}
