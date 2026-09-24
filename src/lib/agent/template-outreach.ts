import "server-only";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/agent/audit";
import { isCustomerSuppressed } from "@/lib/agent/contact-permission";
import {
  isWhatsAppConfigured,
  sendWhatsAppButtons,
  sendWhatsAppTemplate,
} from "@/lib/channel/whatsapp-client";
import {
  TEMPLATE_LANGUAGE,
  WHATSAPP_TEMPLATES,
  openingTemplateForSignal,
  renderTemplate,
  sanitizeTemplateParam,
  type TemplateChoice,
  type TemplateName,
} from "@/lib/channel/whatsapp-templates";
import { getFrequentProducts } from "@/lib/db/customer-detail";
import { saveCustomerInsight } from "@/lib/tools/customer";
import { followUpTemplateCandidates } from "@/lib/agent/follow-up-context";
import { loadFollowUpContext, sentTemplateNames } from "@/lib/agent/follow-up-data";

const FALLBACK_PRODUCT = "sus productos habituales";

export type TemplateDeliveryMode = "disabled" | "simulate" | "meta";

/**
 * simulate: exact template copy as a session-window text message for demos.
 * meta: approved Meta template payload for production outreach outside 24 h.
 */
export function templateDeliveryMode(): TemplateDeliveryMode {
  const configured = process.env.WHATSAPP_TEMPLATE_MODE?.trim().toLowerCase();
  if (configured === "simulate" || configured === "meta" || configured === "disabled") return configured;
  // Backwards compatibility with the first implementation.
  if (process.env.WHATSAPP_TEMPLATES_ENABLED === "true") return "meta";
  return "disabled";
}

type OutreachTarget = {
  conversationId: string;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  signalType: string | null;
  daysSinceLastPurchase: number | null;
};

async function loadTarget(conversationId: string): Promise<OutreachTarget> {
  const [row] = await sql`
    select conv.id as conversation_id, c.id as customer_id, c.name as customer_name, c.phone as customer_phone,
      o.signal_type,
      case when o.last_purchase_date is null then null else (current_date - o.last_purchase_date) end as days_since
    from agente_comercial.conversations conv
    join agente_comercial.customers c on c.id = conv.customer_id
    join agente_comercial.opportunities o on o.id = conv.opportunity_id
    where conv.id = ${conversationId}
  `;
  if (!row) throw new Error(`Conversación ${conversationId} no encontrada`);
  return {
    conversationId: row.conversation_id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    signalType: row.signal_type,
    daysSinceLastPurchase: row.days_since == null ? null : Number(row.days_since),
  };
}

/**
 * The window is open when the customer wrote on WhatsApp in the last 24 h:
 * either inside a conversation (real inbound messages carry a WhatsApp id)
 * or before one existed, which the webhook records in the audit log.
 */
export async function hasOpenServiceWindow(customerId: string): Promise<boolean> {
  const [row] = await sql`
    with phone as (
      select regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') as digits
      from agente_comercial.customers where id = ${customerId}
    )
    select greatest(
      (select max(m.created_at) from agente_comercial.messages m
        join agente_comercial.conversations conv on conv.id = m.conversation_id
        where conv.customer_id = ${customerId} and m.sender = 'customer' and m.external_message_id is not null),
      (select max(a.created_at) from agente_comercial.audit_log a, phone
        where phone.digits <> '' and a.payload->>'fromDigits' = phone.digits)
    ) > now() - interval '24 hours' as open
  `;
  return Boolean(row?.open);
}

/** Any customer message in this conversation (WhatsApp or panel) in the last 24 h. */
async function customerWroteRecently(conversationId: string): Promise<boolean> {
  const [row] = await sql`
    select exists (
      select 1 from agente_comercial.messages
      where conversation_id = ${conversationId} and sender = 'customer' and created_at > now() - interval '24 hours'
    ) as recent
  `;
  return Boolean(row?.recent);
}

export async function conversationNeedsTemplate(
  conversationId: string,
  purpose: "opening" | "follow_up" = "opening",
): Promise<boolean> {
  const mode = templateDeliveryMode();
  if (mode === "simulate") {
    // The demo shows the approved copy on openings. A follow-up inside the
    // 24 h window is written by the agent from the conversation, exactly as
    // production would do: a fixed template there ignores what was said.
    if (purpose === "opening") return true;
    return !(await customerWroteRecently(conversationId));
  }
  if (mode !== "meta" || !isWhatsAppConfigured()) return false;
  const target = await loadTarget(conversationId);
  if (!target.customerPhone) return false;
  return !(await hasOpenServiceWindow(target.customerId));
}

type LastOrder = { quantity: number; weeksAgo: number; stock: number };

/** The customer's most recent order of their usual product, plus current stock for it. */
async function lastOrderOf(customerId: string, sku: string): Promise<LastOrder | null> {
  const [row] = await sql`
    select pi.quantity, (current_date - pu.purchase_date) as days_ago, p.stock
    from agente_comercial.purchase_items pi
    join agente_comercial.purchases pu on pu.id = pi.purchase_id
    join agente_comercial.products p on p.id = pi.product_id
    where pu.customer_id = ${customerId} and p.sku = ${sku}
    order by pu.purchase_date desc limit 1
  `;
  if (!row || !(Number(row.quantity) > 0)) return null;
  return {
    quantity: Number(row.quantity),
    weeksAgo: Math.max(1, Math.round(Number(row.days_ago) / 7)),
    stock: Number(row.stock),
  };
}

/**
 * Parameters for a template from real data, or null when the data it states
 * is missing: a template never goes out with a claim it cannot back up.
 */
async function buildChoice(target: OutreachTarget, template: TemplateName): Promise<TemplateChoice | null> {
  const [product] = await getFrequentProducts(target.customerId, 1);
  const company = sanitizeTemplateParam(target.customerName);
  const productName = sanitizeTemplateParam(product?.name ?? FALLBACK_PRODUCT);
  const last = product ? await lastOrderOf(target.customerId, product.sku) : null;

  switch (template) {
    case "apertura_recompra":
      return last ? { name: template, params: [company, String(last.quantity), productName, String(last.weeksAgo)] } : null;
    case "seguimiento_valor":
      // "hoy tenemos disponibilidad" must be true for the full usual order.
      return last && last.stock >= last.quantity ? { name: template, params: [productName, String(last.quantity)] } : null;
    case "apertura_reactivacion":
    case "apertura_producto":
      return { name: template, params: [company, productName] };
    default:
      return { name: template, params: [productName] };
  }
}

export async function buildOpeningTemplate(conversationId: string): Promise<TemplateChoice> {
  const target = await loadTarget(conversationId);
  const preferred = await buildChoice(target, openingTemplateForSignal(target.signalType));
  // apertura_reactivacion needs no order history, so it always exists.
  return preferred ?? (await buildChoice(target, "apertura_reactivacion"))!;
}

/** The approved template that fits what was already said, or null when none does. */
export async function buildFollowUpTemplate(conversationId: string, step: number): Promise<TemplateChoice | null> {
  const context = await loadFollowUpContext(conversationId);
  const candidates = followUpTemplateCandidates({
    step,
    customerReplied: context.customerReplied,
    objectionTypes: context.objectionTypes,
    quantityKnown: context.quantityKnown,
    alreadySent: await sentTemplateNames(conversationId),
  });
  const target = await loadTarget(conversationId);
  for (const candidate of candidates) {
    const choice = await buildChoice(target, candidate);
    if (choice) return choice;
  }
  return null;
}

/**
 * Stores the rendered text as an agent message (so the agent sees exactly
 * what the customer received) and sends the template. Send failures are
 * logged, never thrown, like free-text sends.
 */
export async function sendTemplateMessage(conversationId: string, choice: TemplateChoice): Promise<string> {
  const target = await loadTarget(conversationId);
  if (await isCustomerSuppressed(target.customerId)) return "";

  const text = renderTemplate(choice.name, choice.params);
  await sql`
    insert into agente_comercial.messages (conversation_id, direction, sender, body)
    values (${conversationId}, 'outbound', 'agent', ${text})
  `;

  const mode = templateDeliveryMode();
  if (!target.customerPhone || !isWhatsAppConfigured()) {
    await logAudit({
      conversationId,
      category: "system",
      label: `Plantilla "${choice.name}" simulada en el panel (canal de WhatsApp no configurado).`,
      payload: { template: choice.name, deliveryMode: mode, panelOnly: true },
    });
    return text;
  }

  try {
    if (mode === "simulate") {
      // Do not second-guess Meta with a local timestamp. Resetting the demo can
      // delete the conversation that contained the inbound message while the
      // provider's real 24 h session is still open. Meta remains authoritative.
      // Inside the session the template's quick replies become reply buttons.
      const template = WHATSAPP_TEMPLATES[choice.name];
      await sendWhatsAppButtons(target.customerPhone, text, template.buttons, template.footer);
    } else if (mode === "meta") {
      await sendWhatsAppTemplate(target.customerPhone, choice.name, TEMPLATE_LANGUAGE, choice.params);
    } else {
      await logAudit({
        conversationId,
        category: "system",
        label: `Plantilla "${choice.name}" registrada en el panel; entrega por WhatsApp desactivada.`,
        payload: { template: choice.name, deliveryMode: mode, panelOnly: true },
      });
      return text;
    }
    await logAudit({
      conversationId,
      category: "system",
      label: mode === "simulate"
        ? `Texto de la plantilla "${choice.name}" enviado por WhatsApp en modo demo.`
        : `Plantilla "${choice.name}" enviada por Meta (ventana de 24 h cerrada).`,
      payload: { template: choice.name, deliveryMode: mode },
    });
  } catch (err) {
    await logAudit({
      conversationId,
      category: "system",
      label: `No se pudo enviar la plantilla "${choice.name}": ${err instanceof Error ? err.message : String(err)}`.slice(0, 300),
    });
  }
  return text;
}

export async function startConversationWithTemplate(conversationId: string): Promise<void> {
  await sendTemplateMessage(conversationId, await buildOpeningTemplate(conversationId));
}

/** Records explicit written opt-outs and legacy button opt-outs without another agent reply. */
export async function recordOptOutRequest(conversationId: string, customerText: string, externalMessageId: string) {
  const [inserted] = await sql`
    insert into agente_comercial.messages (conversation_id, direction, sender, body, external_message_id)
    values (${conversationId}, 'inbound', 'customer', ${customerText}, ${externalMessageId})
    on conflict do nothing
    returning id
  `;
  if (!inserted) return;
  const [conversation] = await sql`
    select customer_id from agente_comercial.conversations where id = ${conversationId}
  `;
  await saveCustomerInsight({
    conversationId,
    customerId: conversation.customer_id,
    optOut: true,
    resumen: `El cliente pidió no recibir más mensajes: "${customerText}".`,
  });
  await logAudit({
    conversationId,
    category: "opt_out",
    label: `El cliente pidió no recibir más mensajes: opt-out registrado.`,
  });
}
