import "server-only";

/**
 * "Escribiendo…" on the customer's WhatsApp while Fernán prepares a reply.
 *
 * Meta shows the indicator when the business marks the customer's message as
 * read with a typing_indicator; it disappears when the reply arrives or after
 * about 25 seconds. A turn with several tool calls can take longer, so the
 * indicator is renewed every 20 seconds until the reply is sent.
 *
 * Best effort: a failure here is logged and never affects the conversation.
 * Only started once a reply is really coming (a duplicate webhook delivery or
 * an opt-out never shows it).
 */
const RENEW_MS = 20_000;

type Session = { timer: ReturnType<typeof setInterval> };

declare global {
  var __waTyping: Map<string, Session> | undefined;
}

function sessions(): Map<string, Session> {
  return (globalThis.__waTyping ??= new Map());
}

function configured(): boolean {
  return Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

async function markReadAndTyping(messageId: string): Promise<void> {
  const apiVersion = process.env.WHATSAPP_API_VERSION || "v26.0";
  try {
    const res = await fetch(`https://graph.facebook.com/${apiVersion}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
        typing_indicator: { type: "text" },
      }),
    });
    if (!res.ok) console.warn(`[whatsapp] indicador de escritura (${res.status}): ${(await res.text().catch(() => "")).slice(0, 200)}`);
  } catch (error) {
    console.warn("[whatsapp] indicador de escritura:", error instanceof Error ? error.message : error);
  }
}

/** Shows "escribiendo…" for this conversation, answering the given customer message. */
export async function startTyping(conversationId: string, customerMessageId: string | null | undefined): Promise<void> {
  if (!configured() || !customerMessageId) return;
  stopTyping(conversationId);
  const timer = setInterval(() => void markReadAndTyping(customerMessageId), RENEW_MS);
  sessions().set(conversationId, { timer });
  // Not awaited: the agent starts working at once.
  void markReadAndTyping(customerMessageId);
}

/** Stops renewing the indicator; WhatsApp hides it as soon as the reply arrives. */
export function stopTyping(conversationId: string): void {
  const session = sessions().get(conversationId);
  if (!session) return;
  clearInterval(session.timer);
  sessions().delete(conversationId);
}
