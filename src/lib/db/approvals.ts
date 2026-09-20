import "server-only";
import { sql } from "@/lib/db";

export type ApprovalListItem = {
  id: string;
  customerName: string;
  type: string;
  status: string;
  createdAt: string;
  conversationId: string;
};

export async function listApprovals(status?: string): Promise<ApprovalListItem[]> {
  const rows = await sql<
    Array<{ id: string; customer_name: string; type: string; status: string; created_at: string; conversation_id: string }>
  >`
    select a.id, c.name as customer_name, a.type, a.status, a.created_at, a.conversation_id
    from agente_comercial.approvals a
    join agente_comercial.customers c on c.id = a.customer_id
    where ${status ?? null}::text is null or a.status = ${status ?? null}
    order by a.created_at desc
  `;
  return rows.map((r) => ({
    id: r.id,
    customerName: r.customer_name,
    type: r.type,
    status: r.status,
    createdAt: r.created_at,
    conversationId: r.conversation_id,
  }));
}

export type ApprovalContext = {
  reason: string | null;
  productName: string | null;
  productSku: string | null;
  quantity: number | null;
  listValue: number | null;
  unitPrice: number | null;
  stockAvailable: number | null;
  creditAvailable: number | null;
  creditTotal: number | null;
  autonomyMaxPct: number | null;
};

export type ApprovalDetail = {
  id: string;
  customerId: string;
  customerName: string;
  conversationId: string;
  type: string;
  status: string;
  requestedValue: Record<string, unknown>;
  policyMin: number | null;
  policyMax: number | null;
  agentRecommendation: string;
  context: ApprovalContext;
  decidedValue: Record<string, unknown> | null;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
};

export async function getApprovalDetail(id: string): Promise<ApprovalDetail | null> {
  const [row] = await sql`
    select
      a.id, a.conversation_id, a.type, a.status, a.requested_value, a.policy_min, a.policy_max,
      a.agent_recommendation, a.context, a.decided_value, a.decided_by, a.decided_at, a.created_at,
      c.id as customer_id, c.name as customer_name
    from agente_comercial.approvals a
    join agente_comercial.customers c on c.id = a.customer_id
    where a.id = ${id}
  `;
  if (!row) return null;
  return {
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    conversationId: row.conversation_id,
    type: row.type,
    status: row.status,
    requestedValue: row.requested_value ?? {},
    policyMin: row.policy_min != null ? Number(row.policy_min) : null,
    policyMax: row.policy_max != null ? Number(row.policy_max) : null,
    agentRecommendation: row.agent_recommendation,
    context: row.context ?? {},
    decidedValue: row.decided_value,
    decidedBy: row.decided_by,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
  };
}
