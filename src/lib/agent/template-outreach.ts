import "server-only";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/agent/audit";
import { isCustomerSuppressed } from "@/lib/agent/contact-permission";
import {
  isWhatsAppConfigured,
  sendWhatsAppInteractiveButtons,
  sendWhatsAppTemplate,
} from "@/lib/channel/whatsapp-client";
import {
  FOLLOW_UP_TEMPLATES,
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
import { formatUnitPrice } from "@/lib/format";

const FALLBACK_PRODUCT = "tus productos habituales";

export type TemplateDeliveryMode = "disabled" | "simulate" | "meta";

/**
 * simulate: exact template copy + session-window interactive buttons for demos.
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

export async function conversationNeedsTemplate(conversationId: string): Promise<boolean> {
  const mode = templateDeliveryMode();
  // The demo deliberately shows the approved copy on every opening/follow-up.
  if (mode === "simulate") return true;
  if (mode !== "meta" || !isWhatsAppConfigured()) return false;
  const target = await loadTarget(conversationId);
  if (!target.customerPhone) return false;
  return !(await hasOpenServiceWindow(target.customerId));
}

/** Reads price and stock from the same catalog the agent's tools use; null when it can't be offered. */
async function availableUnitPrice(sku: string): Promise<string | null> {
  const [product] = await sql`select unit_price, stock from agente_comercial.products where sku = ${sku}`;
  if (!product || Number(product.stock) <= 0) return null;
  return formatUnitPrice(Number(product.unit_price));
}

async function buildChoice(target: OutreachTarget, preferred: TemplateName): Promise<TemplateChoice> {
  const [product] = await getFrequentProducts(target.customerId, 1);
  const name = sanitizeTemplateParam(target.customerName);
  const productName = sanitizeTemplateParam(product?.name ?? FALLBACK_PRODUCT);

  if (preferred === "apertura_recompra") {
    if (product && target.daysSinceLastPurchase != null) {
      return { name: preferred, params: [name, String(target.daysSinceLastPurchase), productName] };
    }
    return { name: "apertura_reactivacion", params: [name, productName] };
  }

  if (preferred === "apertura_producto" || preferred === "seguimiento_valor") {
    const price = product ? await availableUnitPrice(product.sku) : null;
    if (price) return { name: preferred, params: [name, productName, price] };
    return preferred === "apertura_producto"
      ? { name: "apertura_reactivacion", params: [name, productName] }
      : { name: "seguimiento_recordatorio", params: [name, productName] };
  }

  return { name: preferred, params: [name, productName] };
}

export async function buildOpeningTemplate(conversationId: string): Promise<TemplateChoice> {
  const target = await loadTarget(conversationId);
  return buildChoice(target, openingTemplateForSignal(target.signalType));
}

export async function buildFollowUpTemplate(conversationId: string, step: number): Promise<TemplateChoice> {
  const template = FOLLOW_UP_TEMPLATES[step];
  if (!template) throw new Error(`No hay plantilla para el seguimiento ${step}.`);
  return buildChoice(await loadTarget(conversationId), template);
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
      if (!(await hasOpenServiceWindow(target.customerId))) {
        await logAudit({
          conversationId,
          category: "system",
          label: `Plantilla "${choice.name}" simulada en el panel; no se envió a WhatsApp porque el teléfono demo no abrió la ventana de 24 h.`,
          payload: { template: choice.name, deliveryMode: mode, panelOnly: true },
        });
        return text;
      }
      await sendWhatsAppInteractiveButtons(
        target.customerPhone,
        text,
        WHATSAPP_TEMPLATES[choice.name].buttons.map((button, index) => ({
          id: `demo_${choice.name}_${index + 1}`,
          title: button.text,
        })),
      );
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
        ? `Plantilla "${choice.name}" enviada en modo demo con botones interactivos.`
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

/** The "No me interesa" button is an explicit refusal: record it and stop, without asking the agent to reply. */
export async function recordOptOutButton(conversationId: string, buttonText: string, externalMessageId: string) {
  const [inserted] = await sql`
    insert into agente_comercial.messages (conversation_id, direction, sender, body, external_message_id)
    values (${conversationId}, 'inbound', 'customer', ${buttonText}, ${externalMessageId})
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
    resumen: `El cliente tocó "${buttonText}" en una plantilla.`,
  });
  await logAudit({
    conversationId,
    category: "opt_out",
    label: `El cliente tocó "${buttonText}": opt-out registrado, no se enviarán más mensajes.`,
  });
}
