"use server";

import { redirect } from "next/navigation";
import { decideApproval } from "@/lib/agent/approval-decision";
import { requireDemoSession } from "@/lib/security/session";
import { uuidLike } from "@/lib/zod-helpers";

export async function approveAction(approvalId: string) {
  await requireDemoSession();
  uuidLike.parse(approvalId);
  const { conversationId } = await decideApproval(approvalId, "approve");
  redirect(`/conversaciones/${conversationId}`);
}

export async function rejectAction(approvalId: string) {
  await requireDemoSession();
  uuidLike.parse(approvalId);
  const { conversationId } = await decideApproval(approvalId, "reject");
  redirect(`/conversaciones/${conversationId}`);
}

export async function modifyAction(approvalId: string, formData: FormData) {
  await requireDemoSession();
  uuidLike.parse(approvalId);
  const raw = formData.get("modifiedValue");
  const value = typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(value) || raw === "") throw new Error("Ingresa un valor numérico válido.");
  const { conversationId } = await decideApproval(approvalId, "modify", value);
  redirect(`/conversaciones/${conversationId}`);
}
