import { NextResponse } from "next/server";
import { verifyMetaSignature } from "@/lib/channel/verify-signature";
import { findOpenConversationByPhone } from "@/lib/agent/conversation-lifecycle";
import { runAgentTurn } from "@/lib/agent/runtime";
import { logAudit } from "@/lib/agent/audit";
import { recordOptOutButton } from "@/lib/agent/template-outreach";
import { isOptOutButtonText } from "@/lib/channel/whatsapp-templates";
import { z } from "zod";

// Meta calls this once, when the webhook URL is registered in the app
// dashboard, to prove we control it.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (mode === "subscribe" && expected && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

type WhatsAppMessage = {
  from: string;
  id: string;
  type: string;
  text?: { body: string };
  button?: { text: string; payload?: string };
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
  };
};

/** Free text, or the label of a template quick-reply button the customer tapped. */
function messageText(message: WhatsAppMessage): string | null {
  if (message.type === "text") return message.text?.body || null;
  if (message.type === "button") return message.button?.text || null;
  if (message.type === "interactive" && message.interactive?.type === "button_reply") {
    return message.interactive.button_reply?.title || null;
  }
  return null;
}

const webhookPayloadSchema = z.object({
  entry: z.array(z.object({
    changes: z.array(z.object({
      value: z.object({
        metadata: z.object({ phone_number_id: z.string() }).optional(),
        messages: z.array(z.object({
          from: z.string().regex(/^\d{5,20}$/), id: z.string().min(1).max(512),
          type: z.string(), text: z.object({ body: z.string().max(4096) }).optional(),
          button: z.object({ text: z.string().max(256), payload: z.string().max(256).optional() }).optional(),
          interactive: z.object({
            type: z.string(),
            button_reply: z.object({ id: z.string().max(256), title: z.string().max(256) }).optional(),
          }).optional(),
        })).optional(),
      }).optional(),
    })).optional(),
  })).optional(),
});
type WhatsAppWebhookPayload = z.infer<typeof webhookPayloadSchema>;

function extractMessages(payload: WhatsAppWebhookPayload): WhatsAppMessage[] {
  const messages: WhatsAppMessage[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const message of change.value?.messages ?? []) {
        messages.push(message);
      }
    }
  }
  return messages;
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  const appSecret = process.env.WHATSAPP_APP_SECRET;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!appSecret || !phoneNumberId) return new NextResponse("Webhook not configured", { status: 503 });
  if (appSecret) {
    const signature = request.headers.get("x-hub-signature-256");
    if (!verifyMetaSignature(rawBody, signature, appSecret)) {
      return new NextResponse("Invalid signature", { status: 401 });
    }
  }
  // Signed requests are required in every environment, including local tests.

  let payload: WhatsAppWebhookPayload;
  try {
    payload = webhookPayloadSchema.parse(JSON.parse(rawBody));
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.value?.messages?.length && change.value.metadata?.phone_number_id !== phoneNumberId) {
        return new NextResponse("Wrong destination", { status: 403 });
      }
    }
  }

  const messages = extractMessages(payload).filter((m) => messageText(m) !== null);

  // Awaited synchronously (not fire-and-forget): simplest and platform-
  // agnostic, at the cost of a slower ack to Meta on a long tool-calling
  // turn. Fine at demo scale (one customer at a time); a real pilot with
  // concurrent conversations should move this to a queue.
  for (const message of messages) {
    const conversationId = await findOpenConversationByPhone(message.from);
    if (!conversationId) {
      await logAudit({
        conversationId: null,
        category: "system",
        label: `Mensaje de WhatsApp de ${message.from} sin conversación abierta que lo reciba — ignorado.`,
        // Lets the 24 h service-window check see that this customer wrote first.
        payload: { fromDigits: message.from },
      });
      continue;
    }
    const text = messageText(message)!;
    if ((message.type === "button" || message.type === "interactive") && isOptOutButtonText(text)) {
      await recordOptOutButton(conversationId, text, message.id);
      continue;
    }
    await runAgentTurn(conversationId, text, { externalMessageId: message.id });
  }

  return NextResponse.json({ ok: true });
}
