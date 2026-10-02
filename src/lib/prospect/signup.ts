import "server-only";
import { z } from "zod";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/agent/audit";
import { notifyOwner } from "@/lib/agent/owner-notify";
import { FOUNDER_OFFER } from "@/lib/prospect/offer";

export const SIGNUP_LABEL = "Registro de cliente fundador";

export const signupInput = z.object({
  company: z.string().trim().min(2, "Escriba el nombre de su empresa.").max(120),
  contact: z.string().trim().min(2, "Escriba su nombre.").max(120),
  whatsapp: z.string().trim().regex(/^[+\d\s()-]{7,20}$/, "Escriba un número de WhatsApp válido."),
  method: z.enum(["paypal", "yappy"]),
  reference: z.string().trim().max(120).optional().default(""),
});
export type SignupInput = z.infer<typeof signupInput>;

/** Founder slots left: the offer is limited because each setup is done personally. */
export async function founderSlotsLeft(): Promise<number> {
  const [row] = await sql<Array<{ taken: number }>>`
    select count(*)::int as taken from agente_comercial.audit_log where label = ${SIGNUP_LABEL}
  `;
  return Math.max(0, FOUNDER_OFFER.slots - (row?.taken ?? 0));
}

/**
 * A business that paid (or is paying) the founder setup registers here; the
 * owner gets it on Telegram to verify the payment and schedule the setup.
 * Stored in the audit log: no schema change.
 */
export async function registerFounder(input: SignupInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const [recent] = await sql<Array<{ n: number }>>`
    select count(*)::int as n from agente_comercial.audit_log
    where label = ${SIGNUP_LABEL} and created_at > now() - interval '1 hour'
  `;
  if ((recent?.n ?? 0) >= 10) return { ok: false, error: "Recibimos muchos registros en este momento. Intente de nuevo en unos minutos." };

  const slotsLeft = await founderSlotsLeft();
  const founder = slotsLeft > 0;
  await logAudit({ conversationId: null, category: "system", label: SIGNUP_LABEL, payload: { signup: { ...input, founder } } });
  await notifyOwner(
    null,
    [
      `💰 Nuevo registro${founder ? " de cliente fundador" : " (lista de espera: cupos agotados)"}`,
      "",
      `Empresa: ${input.company}`,
      `Contacto: ${input.contact}`,
      `WhatsApp: ${input.whatsapp}`,
      `Pago: ${input.method === "paypal" ? "PayPal" : "Yappy"}${input.reference ? ` · referencia ${input.reference}` : " · sin referencia"}`,
      "",
      "Verifica el pago y escríbele para coordinar la implementación.",
    ].join("\n"),
  );
  return { ok: true };
}
