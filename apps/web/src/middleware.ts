import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge middleware:
 * - mints a correlation id per request (PRD §149)
 * - guards the authenticated (app) area by checking the Supabase session cookie
 * API routes verify the Bearer token themselves; this only protects page routes.
 */
const PROTECTED_PREFIXES = ["/create", "/projects", "/assets", "/credits", "/billing", "/settings"];

export async function middleware(req: NextRequest) {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => req.nextUrl.pathname === p || req.nextUrl.pathname.startsWith(`${p}/`),
  );

  if (isProtected) {
    const token = req.cookies.get("rv-access")?.value;
    if (!token) {
      const url = req.nextUrl.clone();
      url.pathname = "/signin";
      url.searchParams.set("next", req.nextUrl.pathname);
      return NextResponse.redirect(url);
    }
    // Token signature is verified in the route/session helper; here we only gate presence.
  }

  const res = NextResponse.next();
  res.headers.set("x-request-id", requestId);
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
