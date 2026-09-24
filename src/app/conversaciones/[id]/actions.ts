"use server";

import { revalidatePath } from "next/cache";
import { runAgentTurn } from "@/lib/agent/runtime";
import { simulateCustomerSilence } from "@/lib/agent/follow-up";
import { simulateNextPaymentReminder } from "@/lib/payments/payments";
import { requireDemoSession } from "@/lib/security/session";
import { uuidLike } from "@/lib/zod-helpers";

export async function sendMessageAction(conversationId: string, formData: FormData) {
  await requireDemoSession();
  uuidLike.parse(conversationId);
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return;
  if (text.length > 4096) throw new Error("Mensaje demasiado largo.");

  await runAgentTurn(conversationId, text);
  revalidatePath(`/conversaciones/${conversationId}`);
}

export async function simulateNoReplyAction(conversationId: string) {
  await requireDemoSession();
  uuidLike.parse(conversationId);
  await simulateCustomerSilence(conversationId);
  revalidatePath(`/conversaciones/${conversationId}`);
}

export async function simulatePaymentReminderAction(conversationId: string) {
  await requireDemoSession();
  uuidLike.parse(conversationId);
  await simulateNextPaymentReminder(conversationId);
  revalidatePath(`/conversaciones/${conversationId}`);
}
