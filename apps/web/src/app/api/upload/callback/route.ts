import { NextRequest, NextResponse } from "next/server";
import { getStorage, finalizeUpload } from "@rendervid/core";
import { createHmac, timingSafeEqual } from "node:crypto";

export async function PUT(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key") ?? "";
  const userId = req.nextUrl.searchParams.get("userId") ?? "";
  const expires = Number(req.nextUrl.searchParams.get("expires") ?? "0");
  const sig = req.nextUrl.searchParams.get("sig") ?? "";

  if (!key || !userId || !sig) {
    return NextResponse.json({ error: { code: "bad_request", message: "Missing parameters" } }, { status: 400 });
  }
  if (expires < Math.floor(Date.now() / 1000)) {
    return NextResponse.json({ error: { code: "unauthorized", message: "Upload link expired" } }, { status: 401 });
  }
  const expected = createHmac("sha256", process.env.APP_SECRET ?? "dev-secret-change-me")
    .update(`${userId}:${key}:${expires}`)
    .digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: { code: "unauthorized", message: "Invalid signature" } }, { status: 401 });
  }
  if (!key.startsWith(`users/${userId}/uploads/`)) {
    return NextResponse.json({ error: { code: "forbidden", message: "Invalid key" } }, { status: 403 });
  }

  const mime = req.headers.get("content-type") ?? "application/octet-stream";
  const buf = Buffer.from(await req.arrayBuffer());
  const storage = getStorage();
  await storage.put(key, buf, mime);
  const assetId = await finalizeUpload(userId, key, { mimeType: mime, sizeBytes: buf.length });

  return NextResponse.json({ ok: true, assetId });
}
