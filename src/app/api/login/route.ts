import { NextResponse } from "next/server";
import { COOKIE_NAME, sessionValueForPassword } from "@/lib/auth";

export async function POST(request: Request) {
  const expectedPassword = process.env.DEMO_ACCESS_PASSWORD;
  if (!expectedPassword) {
    return process.env.NODE_ENV === "production"
      ? NextResponse.json({ message: "Acceso no configurado." }, { status: 503 })
      : NextResponse.json({ ok: true });
  }

  const { password } = (await request.json().catch(() => ({}))) as { password?: string };
  if (typeof password !== "string" || password !== expectedPassword) {
    return NextResponse.json({ message: "Contraseña incorrecta." }, { status: 401 });
  }

  const sessionValue = await sessionValueForPassword(password);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, sessionValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 12,
    path: "/",
  });
  return response;
}
