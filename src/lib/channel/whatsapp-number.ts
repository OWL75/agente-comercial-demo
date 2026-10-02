import "server-only";

/**
 * The agent's public WhatsApp number, for wa.me links ("Probar por WhatsApp").
 * WHATSAPP_DISPLAY_NUMBER wins; otherwise it is read once from Meta
 * (display_phone_number of the configured phone number id) and cached.
 */
declare global {
  var __waDisplayNumber: { digits: string | null; at: number } | undefined;
}

export async function agentWhatsAppDigits(): Promise<string | null> {
  const configured = (process.env.WHATSAPP_DISPLAY_NUMBER ?? "").replace(/\D/g, "");
  if (configured) return configured;
  const cached = globalThis.__waDisplayNumber;
  if (cached && Date.now() - cached.at < 3_600_000) return cached.digits;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const id = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !id) return null;
  let digits: string | null = null;
  try {
    const apiVersion = process.env.WHATSAPP_API_VERSION || "v26.0";
    const res = await fetch(`https://graph.facebook.com/${apiVersion}/${id}?fields=display_phone_number`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (res.ok) {
      const json = (await res.json()) as { display_phone_number?: string };
      digits = json.display_phone_number?.replace(/\D/g, "") || null;
    }
  } catch {
    digits = null;
  }
  globalThis.__waDisplayNumber = { digits, at: Date.now() };
  return digits;
}

export function waLink(digits: string, text: string): string {
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
