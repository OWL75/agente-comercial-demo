import "server-only";
import { sql, toJsonb } from "@/lib/db";
import { getApprovalDetail } from "@/lib/db/approvals";
import { resumeAfterHumanDecision } from "@/lib/agent/runtime";
import { logAudit } from "@/lib/agent/audit";
import { getActivePolicy } from "@/lib/db/policies";
import { assertContactAllowed } from "@/lib/agent/contact-permission";

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
  decidedBy = "Gerente comercial",
): Promise<{ conversationId: string; summary: string; reply: string }> {
  const approval = await getApprovalDetail(approvalId);
  if (!approval) throw new Error(`Aprobación ${approvalId} no encontrada`);
  if (!["approve", "modify", "reject"].includes(action)) throw new Error("Acción inválida.");
  await assertContactAllowed(approval.customerId);
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
    if (value == null || !Number.isFinite(value) || requested == null) throw new Error("Falta el valor a aprobar.");
    if (approval.type === "discount") {
      const policy = await getActivePolicy();
      if (!policy || value < 0 || value > policy.config.discount.approvalMaxPct) {
        throw new Error("Descuento fuera de la política vigente.");
      }
    } else if (value <= 0 || (approval.type === "delivery" && !Number.isSafeInteger(value))) {
      throw new Error("El valor aprobado debe ser positivo y la entrega debe expresarse en horas enteras.");
    }
    decidedValue = { [key]: value };
    decisionSummary = `Se ${action === "modify" ? "APROBÓ una versión MODIFICADA" : "APROBÓ"} la solicitud de ${approval.type}: ${describeDecidedValue(approval.type, value)}.`;
  }

  const [decided] = await sql`
    update agente_comercial.approvals
    set status = ${status},
        decided_value = ${toJsonb(decidedValue)},
        decided_by = ${decidedBy},
        decided_at = now()
    where id = ${approvalId} and status = 'pending'
      and requested_value = ${toJsonb(approval.requestedValue)}
      and context = ${toJsonb(approval.context)}
    returning id
  `;
  if (!decided) throw new Error("La solicitud cambió o ya fue decidida. Recarga antes de decidir.");

  await logAudit({
    conversationId: approval.conversationId,
    category: "approval_decided",
    label: decisionSummary,
    payload: { approvalId, status, decidedValue },
  });

  const { reply } = await resumeAfterHumanDecision(approval.conversationId, decisionSummary);

  return { conversationId: approval.conversationId, summary: decisionSummary, reply };
}
