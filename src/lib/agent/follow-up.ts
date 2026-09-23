import "server-only";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/agent/audit";
import { isCustomerSuppressed } from "@/lib/agent/contact-permission";
import { sendFollowUp } from "@/lib/agent/runtime";
import { FOLLOW_UP_TOTAL, nextFollowUpStep } from "@/lib/agent/follow-up-sequence";

export type FollowUpState = {
  sentCount: number;
  canSimulate: boolean;
  blockedReason: string | null;
};

/**
 * Follow-ups are counted from the audit log since the customer's last
 * message, so any reply from the customer restarts the sequence.
 */
export async function getFollowUpState(conversationId: string): Promise<FollowUpState> {
  const [row] = await sql`
    select
      conv.ended_at,
      conv.customer_id,
      (select sender from agente_comercial.messages m
        where m.conversation_id = conv.id order by m.created_at desc limit 1) as last_sender,
      (select count(*)::int from agente_comercial.audit_log a
        where a.conversation_id = conv.id
          and a.payload->>'followUpStep' is not null
          and a.created_at > coalesce(
            (select max(m.created_at) from agente_comercial.messages m
              where m.conversation_id = conv.id and m.sender = 'customer'),
            '-infinity'::timestamptz)) as sent_count
    from agente_comercial.conversations conv
    where conv.id = ${conversationId}
  `;
  if (!row) return { sentCount: 0, canSimulate: false, blockedReason: "Conversación no encontrada." };

  const sentCount: number = row.sent_count;
  const blockedReason = row.ended_at
    ? "La conversación ya terminó."
    : (await isCustomerSuppressed(row.customer_id))
      ? "El cliente pidió no recibir más mensajes: la secuencia queda detenida."
      : !row.last_sender
        ? "Primero inicia la conversación."
        : row.last_sender === "customer"
          ? "El cliente respondió: el agente contesta y la secuencia se reinicia."
          : sentCount >= FOLLOW_UP_TOTAL
            ? "Secuencia completa: la oportunidad queda en pausa hasta el próximo ciclo de compra."
            : null;

  return { sentCount, canSimulate: blockedReason === null, blockedReason };
}

/** Demo control: pretends the customer stayed silent and sends the next touch right away. */
export async function simulateCustomerSilence(conversationId: string): Promise<void> {
  const state = await getFollowUpState(conversationId);
  const step = nextFollowUpStep(state.sentCount);
  if (!state.canSimulate || !step) return;

  try {
    const { reply } = await sendFollowUp(conversationId, step);
    if (!reply) return;
    await logAudit({
      conversationId,
      category: "system",
      label: `Seguimiento ${step.step} de ${FOLLOW_UP_TOTAL} — ${step.title} (simulado; en producción: ${step.productionDelay})`,
      payload: { followUpStep: step.step, simulated: true },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logAudit({
      conversationId,
      category: "system",
      label: `No se pudo generar el seguimiento ${step.step}: ${message}`.slice(0, 300),
    });
  }
}
