"use server";

import { redirect } from "next/navigation";
import { startConversationForOpportunity } from "@/lib/agent/conversation-lifecycle";

export async function startConversationAction(opportunityId: string) {
  const conversationId = await startConversationForOpportunity(opportunityId);
  redirect(`/conversaciones/${conversationId}`);
}
