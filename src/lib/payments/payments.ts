import "server-only";
import { randomBytes } from "node:crypto";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/agent/audit";
import { isCustomerSuppressed } from "@/lib/agent/contact-permission";
import { askOwner, notifyOwner } from "@/lib/agent/owner-notify";
import { todayInPanama } from "@/lib/agent/system-prompt";
import { isWhatsAppConfigured, sendWhatsAppLinkButton, sendWhatsAppMessage } from "@/lib/channel/whatsapp-client";
import {
  PAYMENT_BUTTON,
  PAYMENT_FOOTER,
  PAYMENT_ISSUE_ACK,
  PAYMENT_METHODS,
  dueDateFor,
  ownerOrderConfirmedText,
  ownerPaymentIssueQuestion,
  ownerPaymentReceivedText,
  paymentReceivedText,
  paymentRequestText,
  type PaymentMethod,
  type PaymentSummary,
} from "@/lib/payments/payment-messages";

/**
 * Payment collection after a confirmed order, without a human in the loop.
 *
 * Provider today: a sandbox checkout page (/pagar/<token>) that simulates
 * card, Yappy and ACH transfer — no money moves. WhatsApp's native payments
 * only exist in India, Brazil and Singapore, so in Panama the real flow is
 * the same shape with a payment-link provider (e.g. Tilopay or Yappy's
 * payment button) whose paid-webhook calls markPaymentReceived.
 *
 * State lives in orders.status (sandbox_created → pendiente_pago → pagado)
 * and audit_log payloads, so no schema change is needed.
 */

export const LINK_CREATED = "Enlace de pago creado";
const ISSUE_REPORTED = "Problema de pago reportado";

export function publicBaseUrl(): string | null {
  const explicit = process.env.PUBLIC_BASE_URL?.trim();
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  // EasyPanel's "$(PRIMARY_DOMAIN)" placeholder is not a usable URL at runtime.
  const url = explicit || (site && !site.includes("$(") ? site : "");
  return url ? url.replace(/\/$/, "") : null;
}

export type PaymentView = PaymentSummary & {
  token: string;
  orderId: string;
  conversationId: string;
  customerId: string;
  customerPhone: string | null;
  status: "pendiente_pago" | "pagado" | string;
  issueReported: boolean;
};

async function orderSummary(orderId: string, dueDate: string) {
  const [row] = await sql<Array<{
    id: string; conversation_id: string; customer_id: string; total: string; discount_pct: string;
    credit_terms: string; delivery_option: string; status: string; customer_name: string; phone: string | null;
    quantity: number; product_name: string;
  }>>`
    select o.id, o.conversation_id, o.customer_id, o.total, o.discount_pct, o.credit_terms, o.delivery_option,
      o.status, c.name as customer_name, c.phone, oi.quantity, p.name as product_name
    from agente_comercial.orders o
    join agente_comercial.customers c on c.id = o.customer_id
    join agente_comercial.order_items oi on oi.order_id = o.id
    join agente_comercial.products p on p.id = oi.product_id
    where o.id = ${orderId}
    limit 1
  `;
  if (!row) throw new Error("Pedido no encontrado.");
  const total = Number(row.total);
  const quantity = Number(row.quantity);
  return {
    orderId: row.id,
    conversationId: row.conversation_id,
    customerId: row.customer_id,
    customerPhone: row.phone,
    status: row.status,
    summary: {
      orderShort: row.id.slice(0, 8).toUpperCase(),
      customerName: row.customer_name,
      productName: row.product_name,
      quantity,
      netUnitPrice: Math.round((total / quantity) * 100) / 100,
      discountPct: Number(row.discount_pct),
      total,
      deliveryOption: row.delivery_option,
      terms: row.credit_terms,
      dueDate,
    } satisfies PaymentSummary,
  };
}

/** Stores the message in the conversation and sends it on WhatsApp (best effort, like every agent send). */
async function tellCustomer(
  target: { conversationId: string; customerId: string; customerPhone: string | null },
  text: string,
  link?: { url: string },
): Promise<void> {
  if (await isCustomerSuppressed(target.customerId)) return;
  // The panel shows the link as text; on WhatsApp it is a "Pagar pedido" button.
  const stored = link ? `${text}\n\n${PAYMENT_BUTTON}: ${link.url}` : text;
  await sql`
    insert into agente_comercial.messages (conversation_id, direction, sender, body)
    values (${target.conversationId}, 'outbound', 'agent', ${stored})
  `;
  if (!isWhatsAppConfigured() || !target.customerPhone) return;
  try {
    if (link) await sendWhatsAppLinkButton(target.customerPhone, text, PAYMENT_BUTTON, link.url, PAYMENT_FOOTER);
    else await sendWhatsAppMessage(target.customerPhone, text);
  } catch (err) {
    await logAudit({
      conversationId: target.conversationId,
      category: "system",
      label: `No se pudo enviar el mensaje de pago por WhatsApp: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300),
    });
  }
}

export async function findPayment(token: string): Promise<PaymentView | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const [link] = await sql<Array<{ order_id: string; due_date: string }>>`
    select payload->>'orderId' as order_id, payload->>'dueDate' as due_date
    from agente_comercial.audit_log
    where label = ${LINK_CREATED} and payload->>'paymentToken' = ${token}
    order by created_at asc limit 1
  `;
  if (!link) return null;
  const order = await orderSummary(link.order_id, link.due_date);
  const [issue] = await sql`
    select id from agente_comercial.audit_log where label = ${ISSUE_REPORTED} and payload->>'paymentToken' = ${token} limit 1
  `;
  return { ...order.summary, ...order, token, issueReported: !!issue };
}

async function linkFor(orderId: string): Promise<{ token: string; dueDate: string } | null> {
  const [row] = await sql<Array<{ token: string; due_date: string }>>`
    select payload->>'paymentToken' as token, payload->>'dueDate' as due_date
    from agente_comercial.audit_log where label = ${LINK_CREATED} and payload->>'orderId' = ${orderId}
    order by created_at asc limit 1
  `;
  return row ? { token: row.token, dueDate: row.due_date } : null;
}

/** Called right after the order is created: one payment link per order, sent as its own message. */
export async function sendPaymentRequest(orderId: string): Promise<string | null> {
  const base = publicBaseUrl();
  let link = await linkFor(orderId);
  if (!link) {
    const pending = await orderSummary(orderId, todayInPanama());
    const token = randomBytes(24).toString("base64url");
    const dueDate = dueDateFor(pending.summary.terms, todayInPanama());
    await sql`update agente_comercial.orders set status = 'pendiente_pago' where id = ${orderId} and status = 'sandbox_created'`;
    await logAudit({
      conversationId: pending.conversationId,
      category: "system",
      label: LINK_CREATED,
      payload: { paymentToken: token, orderId, amount: pending.summary.total, dueDate },
    });
    link = { token, dueDate };
  }
  const order = await orderSummary(orderId, link.dueDate);
  if (!base) {
    await logAudit({ conversationId: order.conversationId, category: "system", label: "Enlace de pago sin URL pública configurada (PUBLIC_BASE_URL)." });
    return null;
  }
  const url = `${base}/pagar/${link.token}`;
  await tellCustomer(order, paymentRequestText(order.summary), { url });
  return url;
}

export async function announceOrderToOwner(orderId: string): Promise<void> {
  const link = await linkFor(orderId);
  const order = await orderSummary(orderId, link?.dueDate ?? todayInPanama());
  await notifyOwner(order.conversationId, ownerOrderConfirmedText(order.summary));
}

/** Idempotent: a second notification for the same payment changes nothing. */
export async function markPaymentReceived(token: string, method: PaymentMethod): Promise<{ alreadyPaid: boolean }> {
  const payment = await findPayment(token);
  if (!payment) throw new Error("Enlace de pago no válido.");
  if (!(method in PAYMENT_METHODS)) throw new Error("Método de pago no válido.");
  const [updated] = await sql`
    update agente_comercial.orders set status = 'pagado'
    where id = ${payment.orderId} and status = 'pendiente_pago' returning id
  `;
  if (!updated) return { alreadyPaid: true };
  const label = `${PAYMENT_METHODS[method]}, pago de prueba`;
  await logAudit({
    conversationId: payment.conversationId,
    category: "system",
    label: `Pago recibido (${label}): $${payment.total}`,
    payload: { paymentToken: token, orderId: payment.orderId, method, amount: payment.total, simulated: true },
  });
  await tellCustomer(payment, paymentReceivedText(payment, label));
  await notifyOwner(payment.conversationId, ownerPaymentReceivedText(payment, label));
  return { alreadyPaid: false };
}

/** The customer needs another way to pay, a split, more time… → the owner decides on Telegram. */
export async function reportPaymentIssue(token: string, issue: string): Promise<void> {
  const payment = await findPayment(token);
  if (!payment) throw new Error("Enlace de pago no válido.");
  const text = issue.replace(/\s+/g, " ").trim().slice(0, 500);
  if (text.length < 3) throw new Error("Cuéntenos brevemente qué necesita.");
  await logAudit({
    conversationId: payment.conversationId,
    category: "system",
    label: ISSUE_REPORTED,
    payload: { paymentToken: token, orderId: payment.orderId, issue: text },
  });
  await askOwner(payment.conversationId, ownerPaymentIssueQuestion(payment, text));
  await tellCustomer(payment, PAYMENT_ISSUE_ACK);
}

/** For a conversation whose order is created but unpaid: what the agent should know. */
export async function pendingPaymentFor(conversationId: string): Promise<PaymentView | null> {
  const [row] = await sql<Array<{ id: string }>>`
    select id from agente_comercial.orders where conversation_id = ${conversationId} and status = 'pendiente_pago' limit 1
  `;
  if (!row) return null;
  const link = await linkFor(row.id);
  return link ? findPayment(link.token) : null;
}
