import "server-only";

/**
 * Minimal Telegram Bot API client for the owner channel. The bot is
 * dedicated to this agent: a Telegram bot can only have one webhook, so it
 * must never be shared with an n8n workflow.
 */

export type InlineButton = { text: string; callback_data: string };
export type ReplyMarkup =
  | { inline_keyboard: InlineButton[][] }
  | { force_reply: true; input_field_placeholder?: string }
  | { keyboard: Array<Array<{ text: string; request_contact?: boolean }>>; one_time_keyboard: boolean; resize_keyboard: boolean }
  | { remove_keyboard: true };

export function isTelegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_WEBHOOK_SECRET);
}

async function call<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN no está configurado.");
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string } | null;
  if (!response.ok || !data?.ok) {
    // Never echo the URL: it contains the bot token.
    throw new Error(`Telegram ${method} falló: ${data?.description ?? response.status}`);
  }
  return data.result as T;
}

export async function sendTelegramMessage(
  chatId: number | string,
  text: string,
  replyMarkup?: ReplyMarkup,
): Promise<{ messageId: number }> {
  const result = await call<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text: text.slice(0, 4096),
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
  return { messageId: result.message_id };
}

export async function answerTelegramCallback(callbackQueryId: string, text?: string): Promise<void> {
  await call("answerCallbackQuery", { callback_query_id: callbackQueryId, ...(text ? { text } : {}) });
}

/** Replaces the buttons of an answered request so it cannot be decided twice from the chat. */
export async function closeTelegramButtons(chatId: number | string, messageId: number, note: string): Promise<void> {
  await call("editMessageReplyMarkup", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } });
  await sendTelegramMessage(chatId, note);
}
