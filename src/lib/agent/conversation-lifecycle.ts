import "server-only";
import { sql } from "@/lib/db";
import { startConversation } from "@/lib/agent/runtime";
import { logAudit } from "@/lib/agent/audit";
import { normalizePhone } from "@/lib/channel/phone";

/**
 * "Iniciar conversación" is idempotent: if the opportunity already has an
 * open (not-yet-ended) conversation, we resume it instead of spawning a
 * second parallel thread with the same customer.
 */
export async function startConversationForOpportunity(opportunityId: string): Promise<string> {
  const [existing] = await sql<Array<{ id: string }>>`
    select id from agente_comercial.conversations
    where opportunity_id = ${opportunityId} and ended_at is null
    order by started_at desc
    limit 1
  `;
  if (existing) return existing.id;

  const [opportunity] = await sql<Array<{ customer_id: string }>>`
    select customer_id from agente_comercial.opportunities where id = ${opportunityId}
  `;
  if (!opportunity) throw new Error(`Oportunidad ${opportunityId} no encontrada`);

  const [conversation] = await sql<Array<{ id: string }>>`
    insert into agente_comercial.conversations (opportunity_id, customer_id, channel, stage)
    values (${opportunityId}, ${opportunity.customer_id}, 'whatsapp_simulado', 'discovery')
    returning id
  `;

  await sql`
    update agente_comercial.opportunities
    set status = 'contactada', updated_at = now()
    where id = ${opportunityId} and status = 'detectada'
  `;

  await logAudit({
    conversationId: conversation.id,
    category: "system",
    label: "Conversación iniciada por el agente",
  });

  await startConversation(conversation.id);

  return conversation.id;
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
