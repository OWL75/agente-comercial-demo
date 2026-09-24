import "server-only";

const DEFAULT_API_VERSION = "v26.0";

export function isWhatsAppConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} no está configurada. Revisa .env.local.`);
  return value;
}

/**
 * Sends a plain-text WhatsApp message via the Meta Graph API. Errors are
 * thrown, not swallowed — callers that want a best-effort send (so a
 * WhatsApp outage never breaks the in-app conversation) decide that at the
 * call site, not here.
 */
export async function sendWhatsAppMessage(toPhone: string, body: string): Promise<{ messageId: string | null }> {
  return postMessage({
    messaging_product: "whatsapp",
    to: toPhone.replace(/\D/g, ""),
    type: "text",
    text: { body },
  });
}

/** Sends a Meta-approved template; the only kind of message allowed outside the 24 h window. */
export async function sendWhatsAppTemplate(
  toPhone: string,
  name: string,
  languageCode: string,
  bodyParams: string[],
): Promise<{ messageId: string | null }> {
  return postMessage({
    messaging_product: "whatsapp",
    to: toPhone.replace(/\D/g, ""),
    type: "template",
    template: {
      name,
      language: { code: languageCode },
      components: bodyParams.length
        ? [{ type: "body", parameters: bodyParams.map((text) => ({ type: "text", text })) }]
        : [],
    },
  });
}

export type WhatsAppReplyButton = { id: string; title: string };

/**
 * Sends session-window reply buttons. The demo uses this to reproduce the
 * appearance and interaction of a template before the real Meta templates
 * are approved; production templates still use sendWhatsAppTemplate.
 */
export async function sendWhatsAppInteractiveButtons(
  toPhone: string,
  body: string,
  buttons: WhatsAppReplyButton[],
): Promise<{ messageId: string | null }> {
  if (buttons.length < 1 || buttons.length > 3) throw new Error("WhatsApp permite entre 1 y 3 botones de respuesta.");
  return postMessage({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: toPhone.replace(/\D/g, ""),
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body },
      action: {
        buttons: buttons.map((button) => ({
          type: "reply",
          reply: button,
        })),
      },
    },
  });
}

async function postMessage(payload: Record<string, unknown>): Promise<{ messageId: string | null }> {
  const accessToken = requireEnv("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = requireEnv("WHATSAPP_PHONE_NUMBER_ID");
  const apiVersion = process.env.WHATSAPP_API_VERSION || DEFAULT_API_VERSION;

  const res = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    throw new Error(`WhatsApp send failed (${res.status}): ${errorBody.slice(0, 500)}`);
  }

  const json = (await res.json()) as { messages?: Array<{ id: string }> };
  return { messageId: json.messages?.[0]?.id ?? null };
}
