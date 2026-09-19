import { NextResponse } from "next/server";
import { supabaseSignUp, devSignUp, devAuthEnabled, ensureLocalUser, toAuthSession } from "@rendervid/core";
import { errorResponse, readJson } from "@/lib/api-auth";
import { setAccessCookie } from "@/lib/session";
import { SignUpRequest } from "@rendervid/shared";

export async function POST(req: Request) {
  try {
    const body = await readJson<unknown>(req as never);
    const parsed = SignUpRequest.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "bad_request", message: "Enter a valid email and a password of at least 8 characters." } },
        { status: 400 },
      );
    }

    const session = devAuthEnabled()
      ? await devSignUp(parsed.data)
      : await supabaseSignUp(parsed.data);
    const local = await ensureLocalUser(session.user);
    await setAccessCookie(session.access_token, session.expires_at);

    return NextResponse.json(toAuthSession(session, local));
  } catch (err) {
    const e = err as { code?: string; httpStatus?: number; message?: string };
    const status = e.httpStatus ?? (e.code === "conflict" ? 409 : e.code === "bad_request" ? 400 : 500);
    return NextResponse.json(
      { error: { code: e.code ?? "internal_error", message: e.message ?? "Signup failed" } },
      { status },
    );
  }
}
