import "server-only";
import { sql } from "@/lib/db";
import { startConversation } from "@/lib/agent/runtime";
import { conversationNeedsTemplate, startConversationWithTemplate } from "@/lib/agent/template-outreach";
import { normalizePhone } from "@/lib/channel/phone";
import { isWhatsAppConfigured } from "@/lib/channel/whatsapp-client";

/**
 * "Iniciar conversación" is idempotent: if the opportunity already has an
 * open (not-yet-ended) conversation, we resume it instead of spawning a
 * second parallel thread with the same customer.
 */
export async function startConversationForOpportunity(opportunityId: string): Promise<string> {
  const channel = isWhatsAppConfigured() ? "whatsapp" : "whatsapp_simulado";
  const result = await sql.begin(async (tx) => {
    const [opportunity] = await tx`
      select customer_id, status from agente_comercial.opportunities where id = ${opportunityId} for update
    `;
    if (!opportunity) throw new Error("Oportunidad no encontrada.");
    if (opportunity.status === "cerrada" || opportunity.status === "perdida") throw new Error("La oportunidad ya terminó.");
    const [suppression] = await tx`select id from agente_comercial.customer_insights
      where customer_id = ${opportunity.customer_id} and opt_out = true limit 1`;
    if (suppression) throw new Error("Cliente excluido por opt-out.");
    const [existing] = await tx`
      select id from agente_comercial.conversations where opportunity_id = ${opportunityId} and ended_at is null
      order by started_at desc limit 1
    `;
    if (existing) return { id: existing.id as string, created: false };
    const [conversation] = await tx`
      insert into agente_comercial.conversations (opportunity_id, customer_id, channel, stage)
      values (${opportunityId}, ${opportunity.customer_id}, ${channel}, 'discovery') returning id
    `;
    await tx`update agente_comercial.opportunities set status = 'contactada', updated_at = now()
      where id = ${opportunityId} and status in ('detectada', 'preparada')`;
    await tx`insert into agente_comercial.audit_log (conversation_id, category, label, payload)
      values (${conversation.id}, 'system', 'Conversación iniciada por el agente', ${tx.json({})})`;
    return { id: conversation.id as string, created: true };
  });
  // OpenAI and WhatsApp calls deliberately remain outside the transaction.
  if (result.created) {
    if (await conversationNeedsTemplate(result.id)) await startConversationWithTemplate(result.id);
    else await startConversation(result.id);
  }
  return result.id;
}

/**
 * Routes an inbound real WhatsApp message to the right open conversation.
 * Only matches conversations the agent (or a human) already started — a
 * customer texting our WhatsApp number out of the blue, with no prior
 * opportunity/conversation, is out of scope for this demo.
 */
export async function findOpenConversationByPhone(phone: string): Promise<string | null> {
  const digits = normalizePhone(phone);
  if (!digits) return null;

  // '[^0-9]' rather than '\D': inside a JS template literal, `\D` cooks to
  // just `D` (unrecognized escapes silently drop the backslash), so the
  // SQL that used to reach Postgres was `regexp_replace(phone, 'D', ...)`
  // — matching nothing, ever. A character class needs no backslash at all.
  const [row] = await sql<Array<{ id: string }>>`
    select conv.id
    from agente_comercial.customers c
    join agente_comercial.conversations conv on conv.customer_id = c.id and conv.ended_at is null
    where regexp_replace(c.phone, '[^0-9]', '', 'g') = ${digits}
    order by conv.started_at desc
    limit 1
  `;
  return row?.id ?? null;
}

/**
 * A customer who writes after the sale closed, while its payment is pending
 * (to ask how to pay, for another method…), reaches that conversation.
 */
export async function findPendingPaymentConversationByPhone(phone: string): Promise<string | null> {
  const digits = normalizePhone(phone);
  if (!digits) return null;
  const [row] = await sql<Array<{ id: string }>>`
    select conv.id
    from agente_comercial.customers c
    join agente_comercial.conversations conv on conv.customer_id = c.id
    join agente_comercial.orders o on o.conversation_id = conv.id and o.status = 'pendiente_pago'
    where regexp_replace(c.phone, '[^0-9]', '', 'g') = ${digits}
    order by conv.started_at desc
    limit 1
  `;
  return row?.id ?? null;
}
