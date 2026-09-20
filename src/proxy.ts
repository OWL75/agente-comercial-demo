import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_NAME, expectedSessionValue } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  // No DEMO_ACCESS_PASSWORD configured (e.g. local dev without .env.local yet) — don't lock people out.
  const expected = await expectedSessionValue();
  if (!expected) return NextResponse.next();

  const session = request.cookies.get(COOKIE_NAME)?.value;
  if (session === expected) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!login|api/login|_next/static|_next/image|favicon.ico).*)"],
};
