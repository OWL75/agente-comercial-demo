"use server";

import { revalidatePath } from "next/cache";
import { runAgentTurn } from "@/lib/agent/runtime";
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
