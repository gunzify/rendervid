import { NextResponse } from "next/server";
import { supabaseSignIn, devSignIn, devAuthEnabled, ensureLocalUser, toAuthSession } from "@rendervid/core";
import { readJson } from "@/lib/api-auth";
import { setAccessCookie } from "@/lib/session";
import { SignInRequest } from "@rendervid/shared";

export async function POST(req: Request) {
  try {
    const body = await readJson<unknown>(req as never);
    const parsed = SignInRequest.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "bad_request", message: "Enter your email and password." } },
        { status: 400 },
      );
    }

    const session = devAuthEnabled()
      ? await devSignIn(parsed.data)
      : await supabaseSignIn(parsed.data);
    const local = await ensureLocalUser(session.user);
    await setAccessCookie(session.access_token, session.expires_at);
    return NextResponse.json(toAuthSession(session, local));
  } catch (err) {
    const e = err as { code?: string; message?: string };
    const status = e.code === "unauthorized" ? 401 : e.code === "conflict" ? 409 : e.code === "bad_request" ? 400 : 500;
    return NextResponse.json(
      { error: { code: e.code ?? "internal_error", message: e.message ?? "Sign in failed" } },
      { status },
    );
  }
}
