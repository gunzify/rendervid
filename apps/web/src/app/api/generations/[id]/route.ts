import { NextRequest, NextResponse } from "next/server";
import { generationToDto } from "@rendervid/core";
import { requireUser, errorResponse } from "@/lib/api-auth";
import { randomUUID } from "node:crypto";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const requestId = randomUUID();
  try {
    const { userId } = await requireUser(req);
    const { id } = await ctx.params;
    const dto = await generationToDto(id, userId);
    if (!dto) {
      return NextResponse.json({ error: { code: "not_found", message: "Creation not found" } }, { status: 404 });
    }
    return NextResponse.json(dto);
  } catch (err) {
    return errorResponse(err, requestId);
  }
}
