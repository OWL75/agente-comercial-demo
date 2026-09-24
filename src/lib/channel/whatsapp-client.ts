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

/**
 * Session-window message with up to three quick-reply buttons: how demo mode
 * reproduces a template's buttons. The customer's tap arrives as a
 * button_reply whose title the webhook passes to the agent as text.
 */
export async function sendWhatsAppButtons(
  toPhone: string,
  body: string,
  buttons: readonly string[],
  footer?: string,
): Promise<{ messageId: string | null }> {
  if (buttons.length === 0) return sendWhatsAppMessage(toPhone, footer ? `${body}\n\n${footer}` : body);
  return postMessage({
    messaging_product: "whatsapp",
    to: toPhone.replace(/\D/g, ""),
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body },
      ...(footer ? { footer: { text: footer } } : {}),
      action: {
        buttons: buttons.slice(0, 3).map((title, index) => ({ type: "reply", reply: { id: `qr_${index + 1}`, title: title.slice(0, 20) } })),
      },
    },
  });
}

/**
 * Session-window message with one link button (interactive cta_url): the
 * payment link opens from a "Pagar pedido" button instead of a raw URL.
 */
export async function sendWhatsAppLinkButton(
  toPhone: string,
  body: string,
  buttonText: string,
  url: string,
  footer?: string,
): Promise<{ messageId: string | null }> {
  return postMessage({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: toPhone.replace(/\D/g, ""),
    type: "interactive",
    interactive: {
      type: "cta_url",
      body: { text: body },
      ...(footer ? { footer: { text: footer } } : {}),
      action: { name: "cta_url", parameters: { display_text: buttonText.slice(0, 20), url } },
    },
  });
}

/** Sends a Meta-approved template; the only kind of message allowed outside the 24 h window. */
export async function sendWhatsAppTemplate(
  toPhone: string,
  name: string,
  languageCode: string,
  bodyParams: string[],
  /** Dynamic suffix of the template's URL button (the payment token). */
  urlButtonSuffix?: string,
): Promise<{ messageId: string | null }> {
  const components: Record<string, unknown>[] = [];
  if (bodyParams.length) components.push({ type: "body", parameters: bodyParams.map((text) => ({ type: "text", text })) });
  if (urlButtonSuffix) {
    components.push({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: urlButtonSuffix }] });
  }
  return postMessage({
    messaging_product: "whatsapp",
    to: toPhone.replace(/\D/g, ""),
    type: "template",
    template: { name, language: { code: languageCode }, components },
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
