import "server-only";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/agent/audit";
import { getApprovalDetail } from "@/lib/db/approvals";
import { isTelegramConfigured, sendTelegramMessage } from "@/lib/channel/telegram-client";
import {
  approvalButtons,
  formatApprovalForOwner,
  formatQuestionForOwner,
} from "@/lib/agent/owner-messages";

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

/** Sends a free question; the owner's reply to that message resumes the conversation. */
export async function askOwner(conversationId: string, question: string): Promise<boolean> {
  const chatId = await ready(conversationId, "Consulta al dueño");
  if (!chatId) return false;
  try {
    const snapshot = await customerSnapshot(conversationId);
    const { messageId } = await sendTelegramMessage(
      chatId,
      formatQuestionForOwner({ customerName: snapshot?.name ?? "el cliente", question, lastCustomerMessage: snapshot?.last_customer ?? null }),
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
