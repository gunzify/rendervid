import { NextResponse } from "next/server";
import { clearAccessCookie } from "@/lib/session";

export async function POST() {
  await clearAccessCookie();
  return NextResponse.json({ ok: true });
}
