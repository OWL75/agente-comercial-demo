import "server-only";
import { sql, toJsonb } from "@/lib/db";
import { getApprovalDetail } from "@/lib/db/approvals";
import { resumeAfterHumanDecision } from "@/lib/agent/runtime";
import { logAudit } from "@/lib/agent/audit";

const VALUE_KEY_BY_TYPE: Record<string, string> = {
  discount: "pct",
  credit: "amount",
  delivery: "hours",
  other: "value",
};

function describeDecidedValue(type: string, value: number): string {
  if (type === "discount") return `descuento de ${value}%`;
  if (type === "credit") return `crédito adicional de $${value}`;
  if (type === "delivery") return `entrega en ${value} horas`;
  return `${value}`;
}

export type ApprovalAction = "approve" | "modify" | "reject";

export async function decideApproval(
  approvalId: string,
  action: ApprovalAction,
  modifiedValue?: number,
): Promise<{ conversationId: string }> {
  const approval = await getApprovalDetail(approvalId);
  if (!approval) throw new Error(`Aprobación ${approvalId} no encontrada`);
  if (approval.status !== "pending") {
    throw new Error(`Esta aprobación ya fue decidida (${approval.status}).`);
  }

  const key = VALUE_KEY_BY_TYPE[approval.type] ?? "value";
  let status: "approved" | "modified" | "rejected";
  let decidedValue: Record<string, unknown> | null = null;
  let decisionSummary: string;

  if (action === "reject") {
    status = "rejected";
    decisionSummary = `Se RECHAZÓ la solicitud de ${approval.type}. No se puede ofrecer esa condición; continúa con las condiciones estándar.`;
  } else {
    status = action === "modify" ? "modified" : "approved";
    const requested = approval.requestedValue[key];
    const value =
      action === "modify" ? modifiedValue : typeof requested === "number" ? requested : Number(requested);
    if (value == null || Number.isNaN(value)) throw new Error("Falta el valor a aprobar.");
    decidedValue = { [key]: value };
    decisionSummary = `Se ${action === "modify" ? "APROBÓ una versión MODIFICADA" : "APROBÓ"} la solicitud de ${approval.type}: ${describeDecidedValue(approval.type, value)}.`;
  }

  await sql`
    update agente_comercial.approvals
    set status = ${status},
        decided_value = ${toJsonb(decidedValue)},
        decided_by = 'Gerente comercial',
        decided_at = now()
    where id = ${approvalId}
  `;

  await logAudit({
    conversationId: approval.conversationId,
    category: "approval_decided",
    label: decisionSummary,
    payload: { approvalId, status, decidedValue },
  });

  await resumeAfterHumanDecision(approval.conversationId, decisionSummary);

  return { conversationId: approval.conversationId };
}
