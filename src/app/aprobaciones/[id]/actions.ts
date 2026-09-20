"use server";

import { redirect } from "next/navigation";
import { decideApproval } from "@/lib/agent/approval-decision";

export async function approveAction(approvalId: string) {
  const { conversationId } = await decideApproval(approvalId, "approve");
  redirect(`/conversaciones/${conversationId}`);
}

export async function rejectAction(approvalId: string) {
  const { conversationId } = await decideApproval(approvalId, "reject");
  redirect(`/conversaciones/${conversationId}`);
}

export async function modifyAction(approvalId: string, formData: FormData) {
  const raw = formData.get("modifiedValue");
  const value = typeof raw === "string" ? Number(raw) : NaN;
  if (Number.isNaN(value)) throw new Error("Ingresa un valor numérico válido.");
  const { conversationId } = await decideApproval(approvalId, "modify", value);
  redirect(`/conversaciones/${conversationId}`);
}
