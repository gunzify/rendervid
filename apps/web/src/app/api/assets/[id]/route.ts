import { NextRequest, NextResponse } from "next/server";
import { getAsset, softDeleteAsset } from "@rendervid/core";
import { requireUser, errorResponse } from "@/lib/api-auth";
import { randomUUID } from "node:crypto";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const requestId = randomUUID();
  try {
    const { userId } = await requireUser(req);
    const { id } = await ctx.params;
    const asset = await getAsset(userId, id);
    if (!asset) {
      return NextResponse.json({ error: { code: "not_found", message: "Asset not found" } }, { status: 404 });
    }
    return NextResponse.json(asset);
  } catch (err) {
    return errorResponse(err, requestId);
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const requestId = randomUUID();
  try {
    const { userId } = await requireUser(req);
    const { id } = await ctx.params;
    const deleted = await softDeleteAsset(userId, id);
    if (!deleted) {
      return NextResponse.json({ error: { code: "not_found", message: "Asset not found" } }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, requestId);
  }
}
