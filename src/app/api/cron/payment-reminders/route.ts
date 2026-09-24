import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runDuePaymentReminders } from "@/lib/payments/payments";

function authorized(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header ?? "");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/**
 * Daily job for production (e.g. an n8n schedule): sends every payment
 * reminder whose date arrived. Disabled until CRON_SECRET is set; the demo
 * uses the "simular" button in the conversation instead.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new NextResponse("Recordatorios automáticos no configurados", { status: 503 });
  if (!authorized(request.headers.get("authorization"), secret)) return new NextResponse("Forbidden", { status: 403 });
  const sent = await runDuePaymentReminders();
  return NextResponse.json({ ok: true, sent });
}
