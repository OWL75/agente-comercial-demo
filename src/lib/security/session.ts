import "server-only";
import { cookies } from "next/headers";
import { COOKIE_NAME, expectedSessionValue } from "@/lib/auth";

/** Defense in depth: mutations must not rely only on the routing proxy. */
export async function requireDemoSession() {
  const expected = await expectedSessionValue();
  if (!expected && process.env.NODE_ENV !== "production") return;
  if (!expected || (await cookies()).get(COOKIE_NAME)?.value !== expected) {
    throw new Error("Acceso no autorizado.");
  }
}
