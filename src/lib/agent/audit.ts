import "server-only";
import { sql, toJsonb } from "@/lib/db";

export type AuditCategory =
  | "tool_call"
  | "policy_check"
  | "approval_decided"
  | "order_created"
  | "opt_out"
  | "system";

export async function logAudit(params: {
  conversationId: string | null;
  category: AuditCategory;
  label: string;
  payload?: unknown;
}): Promise<void> {
  await sql`
    insert into agente_comercial.audit_log (conversation_id, category, label, payload)
    values (
      ${params.conversationId},
      ${params.category},
      ${params.label},
      ${toJsonb(params.payload ?? {})}
    )
  `;
}
