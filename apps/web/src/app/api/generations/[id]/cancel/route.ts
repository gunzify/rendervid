import { NextRequest, NextResponse } from "next/server";
import { cancelGeneration, generationToDto } from "@rendervid/core";
import { requireUser, errorResponse } from "@/lib/api-auth";
import { randomUUID } from "node:crypto";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const requestId = randomUUID();
  try {
    const { userId } = await requireUser(req);
    const { id } = await ctx.params;

    // Ownership check happens inside the DTO read; cancel requires the same.
    const dto = await generationToDto(id, userId);
    if (!dto) {
      return NextResponse.json({ error: { code: "not_found", message: "Creation not found" } }, { status: 404 });
    }
    await cancelGeneration(id);
    const updated = await generationToDto(id, userId);
    return NextResponse.json(updated);
  } catch (err) {
    return errorResponse(err, requestId);
  }
}
