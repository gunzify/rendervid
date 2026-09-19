import { NextRequest, NextResponse } from "next/server";
import { toggleFavorite } from "@rendervid/core";
import { requireUser, errorResponse } from "@/lib/api-auth";
import { randomUUID } from "node:crypto";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const requestId = randomUUID();
  try {
    const { userId } = await requireUser(req);
    const { id } = await ctx.params;
    const asset = await toggleFavorite(userId, id);
    if (!asset) {
      return NextResponse.json({ error: { code: "not_found", message: "Asset not found" } }, { status: 404 });
    }
    return NextResponse.json(asset);
  } catch (err) {
    return errorResponse(err, requestId);
  }
}
