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
  const accessToken = requireEnv("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = requireEnv("WHATSAPP_PHONE_NUMBER_ID");
  const apiVersion = process.env.WHATSAPP_API_VERSION || DEFAULT_API_VERSION;

  const res = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toPhone.replace(/\D/g, ""),
      type: "text",
      text: { body },
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    throw new Error(`WhatsApp send failed (${res.status}): ${errorBody.slice(0, 500)}`);
  }

  const json = (await res.json()) as { messages?: Array<{ id: string }> };
  return { messageId: json.messages?.[0]?.id ?? null };
}
