import "server-only";
import { sql } from "@/lib/db";
import { buildFollowUpContext, type FollowUpContext, type FollowUpInsight } from "@/lib/agent/follow-up-context";

export async function loadFollowUpContext(conversationId: string): Promise<FollowUpContext> {
  const messages = await sql<Array<{ sender: string; body: string; created_at: Date | string }>>`
    select sender, body, created_at from agente_comercial.messages
    where conversation_id = ${conversationId} order by created_at asc
  `;
  const [insight] = await sql<FollowUpInsight[]>`
    select motivo_inactividad, competidor_mencionado, objecion, producto_interes, cantidad, precio_objetivo,
      condicion_solicitada, intencion_compra, resumen
    from agente_comercial.customer_insights where conversation_id = ${conversationId}
  `;
  return buildFollowUpContext(
    messages.map((m) => ({ sender: m.sender, body: m.body, createdAt: new Date(m.created_at) })),
    insight ? { ...insight, cantidad: insight.cantidad == null ? null : Number(insight.cantidad) } : null,
  );
}

/** Templates already sent in this conversation, from the audit trail. */
export async function sentTemplateNames(conversationId: string): Promise<string[]> {
  const rows = await sql<Array<{ template: string }>>`
    select distinct payload->>'template' as template from agente_comercial.audit_log
    where conversation_id = ${conversationId} and payload->>'template' is not null
  `;
  return rows.map((r) => r.template);
}
