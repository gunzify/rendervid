import { NextRequest, NextResponse } from "next/server";
import { getStorage } from "@rendervid/core";
import { createHmac, timingSafeEqual } from "node:crypto";

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const key = path.map(decodeURIComponent).join("/");

  const expires = Number(req.nextUrl.searchParams.get("expires") ?? "0");
  const sig = req.nextUrl.searchParams.get("sig") ?? "";

  const expected = createHmac("sha256", process.env.APP_SECRET ?? "dev-secret-change-me")
    .update(`${key}:${expires}`)
    .digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: { code: "unauthorized", message: "Invalid signature" } }, { status: 401 });
  }
  if (expires < Math.floor(Date.now() / 1000)) {
    return NextResponse.json({ error: { code: "unauthorized", message: "Link expired" } }, { status: 401 });
  }

  try {
    const storage = getStorage();
    const data = await storage.get(key);
    const ext = key.split(".").pop() ?? "";
    const mime =
      ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "mp4" ? "video/mp4" : "application/octet-stream";
    return new NextResponse(new Uint8Array(data), {
      headers: { "Content-Type": mime, "Cache-Control": "private, max-age=3600" },
    });
  } catch {
    return NextResponse.json({ error: { code: "not_found", message: "Not found" } }, { status: 404 });
  }
}
