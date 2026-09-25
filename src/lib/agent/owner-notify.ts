import "server-only";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/agent/audit";
import { getApprovalDetail } from "@/lib/db/approvals";
import { isTelegramConfigured, sendTelegramMessage } from "@/lib/channel/telegram-client";
import {
  approvalButtons,
  formatApprovalForOwner,
  formatCaseForOwner,
  formatQuestionForOwner,
  type OwnerCase,
} from "@/lib/agent/owner-messages";
import { getValueProposition } from "@/lib/tools/value";
import type { VerifiedOfferResult } from "@/lib/tools/offers";

/**
 * Owner channel on Telegram. Links between a Telegram message and what it is
 * about (an approval, a question) live in audit_log payloads, so no schema
 * change is needed and every exchange stays auditable.
 */

export type OwnerLinkPurpose = "approval" | "approval_value" | "question";
export type OwnerLink = {
  purpose: OwnerLinkPurpose;
  conversationId: string;
  approvalId?: string;
  /** Value shown to the owner when the approval was sent. */
  requested?: number | null;
  question?: string;
};

/** Explicit env value wins; otherwise the chat paired by sharing the owner's verified phone. */
export async function ownerChatId(): Promise<string | null> {
  const configured = process.env.TELEGRAM_OWNER_CHAT_ID?.trim();
  if (configured) return configured;
  const [row] = await sql<Array<{ chat_id: string }>>`
    select payload->>'telegramOwnerChatId' as chat_id from agente_comercial.audit_log
    where payload ? 'telegramOwnerChatId'
    order by created_at desc limit 1
  `;
  return row?.chat_id ?? null;
}

export async function recordOwnerPairing(chatId: number): Promise<void> {
  await logAudit({
    conversationId: null,
    category: "system",
    label: "Dueño vinculado al canal de Telegram (teléfono verificado).",
    payload: { telegramOwnerChatId: String(chatId) },
  });
}

async function recordLink(telegramMessageId: number, link: OwnerLink, label: string): Promise<void> {
  await logAudit({
    conversationId: link.conversationId,
    category: "system",
    label,
    payload: { telegramMessageId: String(telegramMessageId), ownerLink: link },
  });
}

export async function findOwnerLink(telegramMessageId: number): Promise<OwnerLink | null> {
  const [row] = await sql<Array<{ link: OwnerLink }>>`
    select payload->'ownerLink' as link from agente_comercial.audit_log
    where payload->>'telegramMessageId' = ${String(telegramMessageId)}
    order by created_at desc limit 1
  `;
  return row?.link ?? null;
}

async function customerSnapshot(conversationId: string) {
  const [row] = await sql<Array<{ name: string; payment_terms: string | null; last_customer: string | null }>>`
    select c.name, c.payment_terms,
      (select body from agente_comercial.messages m where m.conversation_id = conv.id and m.sender = 'customer'
        order by created_at desc limit 1) as last_customer
    from agente_comercial.conversations conv
    join agente_comercial.customers c on c.id = conv.customer_id
    where conv.id = ${conversationId}
  `;
  return row;
}

async function ready(conversationId: string, what: string): Promise<string | null> {
  const chatId = isTelegramConfigured() ? await ownerChatId() : null;
  if (!chatId) {
    await logAudit({
      conversationId,
      category: "system",
      label: `${what}: canal de Telegram del dueño no configurado; queda solo en el panel.`,
    });
  }
  return chatId;
}

/** Best effort: a Telegram outage must never break the customer turn; the panel still has the approval. */
export async function notifyOwnerOfApproval(approvalId: string): Promise<boolean> {
  const approval = await getApprovalDetail(approvalId);
  if (!approval || approval.status !== "pending") return false;
  const requested = approval.requestedValue as Record<string, unknown>;
  const numeric = (["pct", "amount", "hours"].map((k) => requested[k]).find((v) => typeof v === "number") as number | undefined) ?? null;
  // request_approval refreshes the same pending row when re-filed: only
  // message the owner again if what they would approve actually changed.
  const [previous] = await sql<Array<{ link: OwnerLink }>>`
    select payload->'ownerLink' as link from agente_comercial.audit_log
    where payload->'ownerLink'->>'approvalId' = ${approvalId} and payload->'ownerLink'->>'purpose' = 'approval'
    order by created_at desc limit 1
  `;
  if (previous && (previous.link.requested ?? null) === numeric) return true;
  const chatId = await ready(approval.conversationId, "Aprobación pendiente");
  if (!chatId) return false;
  try {
    const snapshot = await customerSnapshot(approval.conversationId);
    const { messageId } = await sendTelegramMessage(
      chatId,
      formatApprovalForOwner({
        customerName: approval.customerName,
        type: approval.type,
        requestedValue: requested,
        context: approval.context as never,
        policyMax: approval.policyMax,
        agentRecommendation: approval.agentRecommendation,
        creditTerms: snapshot?.payment_terms,
        lastCustomerMessage: snapshot?.last_customer ?? null,
      }),
      approvalButtons(approval.id, approval.type, numeric),
    );
    await recordLink(
      messageId,
      { purpose: "approval", conversationId: approval.conversationId, approvalId, requested: numeric },
      "Aprobación enviada al dueño por Telegram.",
    );
    return true;
  } catch (err) {
    await logAudit({
      conversationId: approval.conversationId,
      category: "system",
      label: `No se pudo avisar al dueño por Telegram: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300),
    });
    return false;
  }
}

/**
 * The case as the owner needs it: what the customer wants, what we offered,
 * our margin, why Nova is worth it and the last messages — from recorded
 * data only, never from what the model says about itself.
 */
async function loadOwnerCase(conversationId: string, turnOffer: VerifiedOfferResult | null): Promise<OwnerCase | null> {
  const [row] = await sql<Array<{
    customer_id: string; name: string; objecion: string | null; precio_objetivo: string | null; condicion_solicitada: string | null;
  }>>`
    select c.id as customer_id, c.name, i.objecion, i.precio_objetivo, i.condicion_solicitada
    from agente_comercial.conversations conv
    join agente_comercial.customers c on c.id = conv.customer_id
    left join agente_comercial.customer_insights i on i.conversation_id = conv.id
    where conv.id = ${conversationId}
  `;
  if (!row) return null;
  // What the customer actually saw, not an offer prepared and never sent.
  const [presented] = await sql<Array<{ offer: VerifiedOfferResult }>>`
    select payload->'offer' as offer from agente_comercial.audit_log
    where conversation_id = ${conversationId} and category = 'policy_check' and payload ? 'offer'
    order by created_at desc limit 1
  `;
  const recent = await sql<Array<{ sender: string; body: string }>>`
    select sender, body from agente_comercial.messages
    where conversation_id = ${conversationId} and sender in ('customer', 'agent')
    order by created_at desc limit 6
  `;
  const value = await getValueProposition({ customerId: row.customer_id }).catch(() => null);
  const offer = presented?.offer ?? null;
  const floor = turnOffer?.negotiation?.autonomyFloorUnitPrice ?? offer?.negotiation?.autonomyFloorUnitPrice ?? null;
  return {
    customerName: row.name,
    objection: row.objecion,
    competitorPrice: row.precio_objetivo != null ? Number(row.precio_objetivo) : offer?.negotiation?.referenceUnitPrice ?? null,
    competitorCondition: row.condicion_solicitada,
    accountFacts: value?.customerFacts ?? [],
    lastOffer: offer && {
      productName: offer.productName,
      quantity: offer.quantity,
      netUnitPrice: offer.netUnitPrice,
      listUnitPrice: offer.listUnitPrice,
      total: offer.total,
    },
    floorUnitPrice: floor,
    recentMessages: recent.reverse().map((m) => ({ sender: m.sender === "customer" ? "customer" : "agent", body: m.body })),
  };
}

/** Sends a free question with the whole case; the owner's reply to that message resumes the conversation. */
export async function askOwner(
  conversationId: string,
  question: string,
  opts: { draft?: string | null; turnOffer?: VerifiedOfferResult | null } = {},
): Promise<boolean> {
  const chatId = await ready(conversationId, "Consulta al dueño");
  if (!chatId) return false;
  try {
    const ownerCase = await loadOwnerCase(conversationId, opts.turnOffer ?? null);
    const snapshot = ownerCase ? null : await customerSnapshot(conversationId);
    const { messageId } = await sendTelegramMessage(
      chatId,
      ownerCase
        ? formatCaseForOwner(ownerCase, { question, draft: opts.draft })
        : formatQuestionForOwner({ customerName: snapshot?.name ?? "el cliente", question, lastCustomerMessage: snapshot?.last_customer ?? null }),
      { force_reply: true, input_field_placeholder: "Tu indicación para el cliente…" },
    );
    await recordLink(messageId, { purpose: "question", conversationId, question }, `Consulta enviada al dueño por Telegram: ${question}`.slice(0, 300));
    return true;
  } catch (err) {
    await logAudit({
      conversationId,
      category: "system",
      label: `No se pudo consultar al dueño por Telegram: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300),
    });
    return false;
  }
}

export async function askOwnerForValue(conversationId: string, approvalId: string, prompt: string): Promise<void> {
  const chatId = await ownerChatId();
  if (!chatId) return;
  const { messageId } = await sendTelegramMessage(chatId, prompt, { force_reply: true, input_field_placeholder: "Ej.: 7" });
  await recordLink(messageId, { purpose: "approval_value", conversationId, approvalId }, "Se pidió al dueño un valor alternativo.");
}

/** Informational message to the owner (no reply expected). Best effort, like every owner message. */
export async function notifyOwner(conversationId: string | null, text: string): Promise<boolean> {
  const chatId = isTelegramConfigured() ? await ownerChatId() : null;
  if (!chatId) return false;
  try {
    await sendTelegramMessage(chatId, text);
    return true;
  } catch (err) {
    await logAudit({
      conversationId,
      category: "system",
      label: `No se pudo avisar al dueño por Telegram: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300),
    });
    return false;
  }
}
