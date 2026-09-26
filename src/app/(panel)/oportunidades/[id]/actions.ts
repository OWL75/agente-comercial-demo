"use server";

import { redirect } from "next/navigation";
import { startConversationForOpportunity } from "@/lib/agent/conversation-lifecycle";
import { requireDemoSession } from "@/lib/security/session";
import { uuidLike } from "@/lib/zod-helpers";

export async function startConversationAction(opportunityId: string) {
  await requireDemoSession();
  uuidLike.parse(opportunityId);
  const conversationId = await startConversationForOpportunity(opportunityId);
  redirect(`/conversaciones/${conversationId}`);
}
