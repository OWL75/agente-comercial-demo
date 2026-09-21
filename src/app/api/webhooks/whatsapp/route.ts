import { NextResponse } from "next/server";
import { verifyMetaSignature } from "@/lib/channel/verify-signature";
import { findOpenConversationByPhone } from "@/lib/agent/conversation-lifecycle";
import { runAgentTurn } from "@/lib/agent/runtime";
import { logAudit } from "@/lib/agent/audit";

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
};

type WhatsAppWebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: WhatsAppMessage[];
      };
    }>;
  }>;
};

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
  if (appSecret) {
    const signature = request.headers.get("x-hub-signature-256");
    if (!verifyMetaSignature(rawBody, signature, appSecret)) {
      return new NextResponse("Invalid signature", { status: 401 });
    }
  }
  // No app secret configured yet: accept unsigned requests so the webhook
  // is usable while WHATSAPP_APP_SECRET is still pending — see README.

  let payload: WhatsAppWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  const messages = extractMessages(payload).filter((m) => m.type === "text" && m.text?.body);

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
      });
      continue;
    }
    await runAgentTurn(conversationId, message.text!.body, { externalMessageId: message.id });
  }

  return NextResponse.json({ ok: true });
}
