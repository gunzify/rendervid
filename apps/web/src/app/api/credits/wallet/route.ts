import { NextRequest, NextResponse } from "next/server";
import { getWalletState, walletToDto } from "@rendervid/core";
import { requireUser, errorResponse } from "@/lib/api-auth";
import { randomUUID } from "node:crypto";

export async function GET(req: NextRequest) {
  const requestId = randomUUID();
  try {
    const { userId } = await requireUser(req);
    const wallet = await getWalletState(userId);
    return NextResponse.json(walletToDto(wallet));
  } catch (err) {
    return errorResponse(err, requestId);
  }
}
