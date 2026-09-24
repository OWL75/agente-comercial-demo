import { timingSafeEqual } from "node:crypto";
import { after, NextResponse } from "next/server";
import { handleTelegramUpdate, telegramUpdateSchema } from "@/lib/agent/owner-telegram";
import { logAudit } from "@/lib/agent/audit";

function sameSecret(received: string | null, expected: string): boolean {
  if (!received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Telegram sends the secret registered with setWebhook in this header on
 * every delivery; without it the request did not come from our bot.
 */
export async function POST(request: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || !process.env.TELEGRAM_BOT_TOKEN) return new NextResponse("Telegram no configurado", { status: 503 });
  if (!sameSecret(request.headers.get("x-telegram-bot-api-secret-token"), secret)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const parsed = telegramUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: true });

  // Answer Telegram right away: a decision triggers a full agent turn
  // (OpenAI + WhatsApp), and a slow response would make Telegram retry.
  after(async () => {
    try {
      await handleTelegramUpdate(parsed.data);
    } catch (err) {
      await logAudit({
        conversationId: null,
        category: "system",
        label: `Error procesando Telegram: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300),
      });
    }
  });
  return NextResponse.json({ ok: true });
}
