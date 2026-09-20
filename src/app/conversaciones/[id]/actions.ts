"use server";

import { revalidatePath } from "next/cache";
import { runAgentTurn } from "@/lib/agent/runtime";

export async function sendMessageAction(conversationId: string, formData: FormData) {
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return;

  await runAgentTurn(conversationId, text);
  revalidatePath(`/conversaciones/${conversationId}`);
}
