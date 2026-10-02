import "server-only";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/agent/audit";
import { notifyOwner } from "@/lib/agent/owner-notify";
import { startConversationForOpportunity } from "@/lib/agent/conversation-lifecycle";
import { isWhatsAppConfigured, sendWhatsAppMessage } from "@/lib/channel/whatsapp-client";
import { normalizePhone } from "@/lib/channel/phone";
import { DEMO_CUSTOMER_NAME } from "@/lib/demo-scenario";
import { PROSPECT_SEGMENT } from "@/lib/prospect/flags";
import { FOUNDER_OFFER, landingUrl, usd } from "@/lib/prospect/offer";

export const DEMO_STARTED_LABEL = "Prospecto inició la demo por WhatsApp";

/** "DEMO", "demo", "Quiero probar a Fernán"… — the text of the button on the page and the video. */
export function isDemoRequest(text: string): boolean {
  return /^\s*(?:demo|quiero\s+probar(?:\s+a\s+fern[aá]n)?|probar\s+a\s+fern[aá]n)\s*[.!¡]*\s*$/i.test(text);
}

function perPhoneLimit(): number {
  return Number(process.env.PROSPECT_DEMO_PER_PHONE_LIMIT) || 3;
}
function dailyLimit(): number {
  return Number(process.env.PROSPECT_DEMO_DAILY_LIMIT) || 40;
}

export const DEMO_INTRO = [
  "Hola, soy Fernán, el agente comercial con IA de SISTECOMP. 👋",
  "",
  `En esta demo usted hace de cliente: es el comprador de *${DEMO_CUSTOMER_NAME}*, una empresa que dejó de pedirle a su proveedor, Nova Distribution. Respóndame como lo haría un cliente real: «ahora no», «cambiamos de proveedor», «el precio», o pídame una rebaja.`,
  "",
  "Si me pide un precio fuera de las reglas, se lo consulto al gerente. En su negocio esa consulta le llega a usted por Telegram; aquí el gerente responde solo en unos segundos. Al final verá cómo se cobra el pedido (es una prueba: no se cobra nada).",
  "",
  "Empiezo 👇",
].join("\n");

export function demoClosingText(): string {
  const url = landingUrl();
  return [
    "✅ Así cerraría Fernán una venta con sus clientes: encontró al cliente que se iba, negoció sin regalar margen, consultó al gerente y dejó el pedido cobrado.",
    "",
    `¿Lo quiere vendiendo en su negocio? Precio de fundador a mitad de precio: implementación ${usd(FOUNDER_OFFER.setup.founder)} (antes ${usd(FOUNDER_OFFER.setup.list)}) y ${usd(FOUNDER_OFFER.monthly.founder)}/mes (antes ${usd(FOUNDER_OFFER.monthly.list)}). Solo ${FOUNDER_OFFER.slots} cupos.`,
    ...(url ? ["", `Actívelo aquí: ${url}`] : []),
    "",
    "Escriba DEMO si quiere probar otra vez.",
  ].join("\n");
}

/**
 * A fresh copy of the demo company for this prospect's phone, with the same
 * history as the reusable demo. Earlier demos of the same phone are closed,
 * never deleted. Returns the new opportunity.
 */
async function seedProspectAccount(digits: string): Promise<string> {
  return sql.begin(async (tx) => {
    await tx`
      update agente_comercial.conversations conv set ended_at = now()
      from agente_comercial.customers c
      where c.id = conv.customer_id and conv.ended_at is null
        and c.segment = ${PROSPECT_SEGMENT} and regexp_replace(c.phone, '[^0-9]', '', 'g') = ${digits}
    `;
    const products = await tx<Array<{ id: string; sku: string }>>`
      select id, sku from agente_comercial.products where sku in ('CAP-001', 'CAP-005')
    `;
    const shampoo = products.find((p) => p.sku === "CAP-001");
    const mask = products.find((p) => p.sku === "CAP-005");
    if (!shampoo || !mask) throw new Error("El catálogo demo requiere los productos CAP-001 y CAP-005.");

    const [customer] = await tx<Array<{ id: string }>>`
      insert into agente_comercial.customers
        (name, segment, avg_purchase_freq_days, avg_ticket, credit_total, credit_available, payment_terms, preferred_channel, phone)
      values (${DEMO_CUSTOMER_NAME}, ${PROSPECT_SEGMENT}, 28, 1005.40, 15000, 12000, '30 días', 'whatsapp', ${`+${digits}`})
      returning id
    `;
    const [opportunity] = await tx<Array<{ id: string }>>`
      insert into agente_comercial.opportunities
        (customer_id, signal_type, priority, status, detected_at, last_purchase_date, days_out_of_pattern,
         ticket_promedio, potential_low, potential_high, reason_text, strategy_text)
      values (${customer.id}, 'recompra_atrasada', 'alta', 'preparada', now(), current_date - 42, 14, 1005.40, 900, 1200,
        ${`${DEMO_CUSTOMER_NAME} normalmente recompra cada 28 días y ya superó ese ciclo por 14 días.`},
        'Entender qué detuvo la recompra, resolver la objeción y recuperar un pedido de Shampoo Professional 1L.')
      returning id
    `;
    const purchases: Array<{ daysAgo: number; amount: number; items: Array<[string, number, number]> }> = [
      { daysAgo: 42, amount: 1059, items: [[shampoo.id, 50, 18.5], [mask.id, 10, 13.4]] },
      { daysAgo: 70, amount: 939.7, items: [[shampoo.id, 45, 18.5], [mask.id, 8, 13.4]] },
      { daysAgo: 98, amount: 1017.5, items: [[shampoo.id, 55, 18.5]] },
    ];
    for (const p of purchases) {
      const [purchase] = await tx<Array<{ id: string }>>`
        insert into agente_comercial.purchases (customer_id, purchase_date, amount)
        values (${customer.id}, current_date - ${p.daysAgo}::int, ${p.amount}) returning id
      `;
      for (const [productId, quantity, unitPrice] of p.items) {
        await tx`
          insert into agente_comercial.purchase_items (purchase_id, product_id, quantity, unit_price)
          values (${purchase.id}, ${productId}, ${quantity}, ${unitPrice})
        `;
      }
    }
    return opportunity.id;
  });
}

async function reply(digits: string, text: string): Promise<void> {
  if (!isWhatsAppConfigured()) return;
  try {
    await sendWhatsAppMessage(`+${digits}`, text);
  } catch (error) {
    console.error("[demo prospecto] no se pudo responder:", error instanceof Error ? error.message : error);
  }
}

/**
 * A prospect wrote "DEMO" to the agent's number: Fernán explains the game and
 * starts selling to them. Limited per phone and per day (cost and abuse);
 * the owner gets a Telegram heads-up about the new lead.
 */
export async function startProspectDemo(fromPhone: string): Promise<{ started: boolean; reason?: string; conversationId?: string }> {
  const digits = normalizePhone(fromPhone);
  if (!digits) return { started: false, reason: "invalid_phone" };

  const [counts] = await sql<Array<{ today: number; mine: number }>>`
    select
      count(*) filter (where created_at > now() - interval '24 hours')::int as today,
      count(*) filter (where created_at > now() - interval '24 hours' and payload->>'fromDigits' = ${digits})::int as mine
    from agente_comercial.audit_log where label = ${DEMO_STARTED_LABEL}
  `;
  if ((counts?.mine ?? 0) >= perPhoneLimit()) {
    await reply(digits, `Ya probó la demo ${perPhoneLimit()} veces hoy. Puede volver a intentarlo mañana${landingUrl() ? `, o ver la oferta aquí: ${landingUrl()}` : "."}`);
    return { started: false, reason: "per_phone_limit" };
  }
  if ((counts?.today ?? 0) >= dailyLimit()) {
    await reply(digits, "La demo está muy solicitada hoy. Escríbanos DEMO mañana y se la muestro con gusto.");
    await notifyOwner(null, `⚠️ Se alcanzó el límite diario de demos (${dailyLimit()}). El +${digits} quedó sin demo hoy.`);
    return { started: false, reason: "daily_limit" };
  }

  const opportunityId = await seedProspectAccount(digits);
  // Also opens the 24 h service window: the prospect wrote first.
  await logAudit({ conversationId: null, category: "system", label: DEMO_STARTED_LABEL, payload: { fromDigits: digits } });
  await reply(digits, DEMO_INTRO);
  const conversationId = await startConversationForOpportunity(opportunityId);
  await notifyOwner(null, `🔥 Nuevo prospecto probando a Fernán por WhatsApp: +${digits}. Lo verá en el panel, en Conversaciones → Prospectos.`);
  return { started: true, conversationId };
}
