import "server-only";
import { z } from "zod";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/agent/audit";
import { decideApproval } from "@/lib/agent/approval-decision";
import { resumeAfterOwnerAnswer } from "@/lib/agent/runtime";
import { getApprovalDetail } from "@/lib/db/approvals";
import { answerTelegramCallback, closeTelegramButtons, sendTelegramMessage } from "@/lib/channel/telegram-client";
import { approvalValueLabel, parseCallbackData, parseOwnerValue, samePhone } from "@/lib/agent/owner-messages";
import { askOwnerForValue, findOwnerLink, ownerChatId, recordOwnerPairing } from "@/lib/agent/owner-notify";

const DECIDED_BY = "Dueño (Telegram)";

const chat = z.object({ id: z.number() });
const from = z.object({ id: z.number() });
const telegramMessage = z.object({
  message_id: z.number(),
  chat,
  from: from.optional(),
  text: z.string().max(4096).optional(),
  contact: z.object({ phone_number: z.string().max(32), user_id: z.number().optional() }).optional(),
  reply_to_message: z.object({ message_id: z.number() }).optional(),
});
export const telegramUpdateSchema = z.object({
  update_id: z.number(),
  message: telegramMessage.optional(),
  callback_query: z.object({
    id: z.string(),
    from,
    data: z.string().max(64).optional(),
    message: z.object({ message_id: z.number(), chat }).optional(),
  }).optional(),
});
export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;

const quote = (text: string) => `«${text.length > 600 ? `${text.slice(0, 600)}…` : text}»`;

/** Telegram retries deliveries; each update is applied at most once. */
async function claimUpdate(updateId: number): Promise<boolean> {
  const [seen] = await sql`
    select id from agente_comercial.audit_log where payload->>'telegramUpdateId' = ${String(updateId)} limit 1
  `;
  if (seen) return false;
  await logAudit({ conversationId: null, category: "system", label: "Actualización de Telegram recibida", payload: { telegramUpdateId: String(updateId) } });
  return true;
}

async function handlePairing(message: NonNullable<TelegramUpdate["message"]>): Promise<boolean> {
  const ownerPhone = process.env.TELEGRAM_OWNER_PHONE ?? "";
  if (message.text?.trim().startsWith("/start")) {
    if ((await ownerChatId()) === String(message.chat.id)) {
      await sendTelegramMessage(message.chat.id, "Ya estás vinculado. Aquí te llegan las consultas del agente comercial.");
    } else {
      await sendTelegramMessage(message.chat.id, "Hola. Para recibir aquí las consultas del agente comercial, comparte tu número con el botón de abajo.", {
        keyboard: [[{ text: "Compartir mi número", request_contact: true }]],
        one_time_keyboard: true,
        resize_keyboard: true,
      });
    }
    return true;
  }
  if (message.contact) {
    // Only the sender's own contact counts (user_id === from.id): a typed or
    // forwarded contact card with the owner's number does not pair a chat.
    const own = message.contact.user_id != null && message.contact.user_id === message.from?.id;
    if (own && ownerPhone && samePhone(message.contact.phone_number, ownerPhone)) {
      await recordOwnerPairing(message.chat.id);
      await sendTelegramMessage(message.chat.id, "Listo, quedaste vinculado. Cuando un cliente pida algo fuera de mi margen te escribo aquí, y apenas decidas le respondo al cliente.", { remove_keyboard: true });
    } else {
      await sendTelegramMessage(message.chat.id, "Este canal es privado del dueño de Nova Distribution.", { remove_keyboard: true });
    }
    return true;
  }
  return false;
}

async function reportResult(chatId: number, messageId: number | undefined, note: string, reply: string) {
  const text = reply ? `${note} Ya le escribí al cliente:\n${quote(reply)}` : `${note} No se envió mensaje al cliente (revisa el panel).`;
  if (messageId) await closeTelegramButtons(chatId, messageId, text);
  else await sendTelegramMessage(chatId, text);
}

async function handleCallback(query: NonNullable<TelegramUpdate["callback_query"]>): Promise<void> {
  const parsed = query.data ? parseCallbackData(query.data) : null;
  const chatId = query.message?.chat.id ?? query.from.id;
  if (!parsed) {
    await answerTelegramCallback(query.id, "No reconozco esta acción.");
    return;
  }
  const approval = await getApprovalDetail(parsed.approvalId);
  if (!approval || approval.status !== "pending") {
    await answerTelegramCallback(query.id, approval ? "Esta solicitud ya estaba decidida." : "No encontré la solicitud.");
    return;
  }
  const requested = approval.requestedValue as Record<string, unknown>;
  const current = ["pct", "amount", "hours"].map((k) => requested[k]).find((v) => typeof v === "number") ?? null;

  if (parsed.action === "ask_value") {
    await answerTelegramCallback(query.id);
    const max = approval.type === "discount" && approval.policyMax != null ? ` (máximo ${approval.policyMax}%)` : "";
    await askOwnerForValue(approval.conversationId, approval.id, `¿Qué valor apruebas para ${approval.customerName}${max}? Responde a este mensaje solo con el número.`);
    return;
  }
  if (parsed.action === "approve" && parsed.value != null && parsed.value !== current) {
    await answerTelegramCallback(query.id, "La solicitud cambió; usa el mensaje más reciente.");
    return;
  }
  await answerTelegramCallback(query.id, parsed.action === "approve" ? "Aprobado" : "Rechazado");
  const { reply } = await decideApproval(approval.id, parsed.action === "approve" ? "approve" : "reject", undefined, DECIDED_BY);
  const note = parsed.action === "approve"
    ? `✅ Aprobado${current != null ? ` ${approvalValueLabel(approval.type, current as number)}` : ""} para ${approval.customerName}.`
    : `❌ Rechazado para ${approval.customerName}.`;
  await reportResult(chatId, query.message?.message_id, note, reply);
}

async function handleOwnerReply(message: NonNullable<TelegramUpdate["message"]>): Promise<void> {
  const text = message.text?.trim();
  const link = message.reply_to_message ? await findOwnerLink(message.reply_to_message.message_id) : null;
  if (!text || !link) {
    await sendTelegramMessage(message.chat.id, "Para responder un caso, mantén presionado su mensaje y elige «Responder».");
    return;
  }
  if (link.purpose === "question") {
    await logAudit({ conversationId: link.conversationId, category: "system", label: `El dueño respondió la consulta: ${text}`.slice(0, 300), payload: { ownerAnswer: text } });
    const { reply } = await resumeAfterOwnerAnswer(link.conversationId, link.question ?? "", text);
    await reportResult(message.chat.id, undefined, "Gracias.", reply);
    return;
  }
  const value = parseOwnerValue(text);
  if (!link.approvalId || value == null) {
    await sendTelegramMessage(message.chat.id, "No encontré un número en tu respuesta. Responde solo con el valor, por ejemplo: 7");
    return;
  }
  const approval = await getApprovalDetail(link.approvalId);
  if (!approval || approval.status !== "pending") {
    await sendTelegramMessage(message.chat.id, "Esa solicitud ya estaba decidida.");
    return;
  }
  const { reply } = await decideApproval(approval.id, "modify", value, DECIDED_BY);
  await reportResult(message.chat.id, undefined, `✏️ Aprobado ${approvalValueLabel(approval.type, value)} para ${approval.customerName}.`, reply);
}

export async function handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
  if (!(await claimUpdate(update.update_id))) return;
  const replyChat = update.message?.chat.id ?? update.callback_query?.message?.chat.id ?? update.callback_query?.from.id;
  try {
    if (update.message && (await handlePairing(update.message))) return;

    // Everything else only from the paired owner chat; other chats get nothing.
    const owner = await ownerChatId();
    if (!owner || String(replyChat) !== owner) return;

    if (update.callback_query) await handleCallback(update.callback_query);
    else if (update.message) await handleOwnerReply(update.message);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logAudit({ conversationId: null, category: "system", label: `Error procesando Telegram: ${message}`.slice(0, 300) });
    if (replyChat) await sendTelegramMessage(replyChat, `No pude aplicar tu decisión: ${message}`).catch(() => undefined);
  }
}
