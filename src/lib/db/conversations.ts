import "server-only";
import { sql } from "@/lib/db";

export type ConversationContextData = {
  conversationId: string;
  opportunityId: string;
  customerId: string;
  customerName: string;
  stage: string;
  objectiveCurrent: string | null;
  reasonText: string | null;
  strategyText: string | null;
  potentialLow: number | null;
  potentialHigh: number | null;
  endedAt: string | null;
};

export async function getConversationContext(
  conversationId: string,
): Promise<ConversationContextData | null> {
  const [row] = await sql`
    select
      conv.id as conversation_id,
      conv.stage,
      conv.objective_current,
      conv.ended_at,
      c.id as customer_id,
      c.name as customer_name,
      o.id as opportunity_id,
      o.reason_text,
      o.strategy_text,
      o.potential_low,
      o.potential_high
    from agente_comercial.conversations conv
    join agente_comercial.customers c on c.id = conv.customer_id
    join agente_comercial.opportunities o on o.id = conv.opportunity_id
    where conv.id = ${conversationId}
  `;
  if (!row) return null;
  return {
    conversationId: row.conversation_id,
    opportunityId: row.opportunity_id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    stage: row.stage,
    objectiveCurrent: row.objective_current,
    reasonText: row.reason_text,
    strategyText: row.strategy_text,
    potentialLow: row.potential_low != null ? Number(row.potential_low) : null,
    potentialHigh: row.potential_high != null ? Number(row.potential_high) : null,
    endedAt: row.ended_at,
  };
}

export type ConversationMessage = {
  id: string;
  direction: "inbound" | "outbound";
  sender: "customer" | "agent" | "system";
  body: string;
  createdAt: string;
};

export async function getConversationMessages(conversationId: string): Promise<ConversationMessage[]> {
  const rows = await sql<
    Array<{ id: string; direction: "inbound" | "outbound"; sender: "customer" | "agent" | "system"; body: string; created_at: string }>
  >`
    select id, direction, sender, body, created_at
    from agente_comercial.messages
    where conversation_id = ${conversationId} and sender <> 'system'
    order by created_at asc
  `;
  return rows.map((r) => ({ id: r.id, direction: r.direction, sender: r.sender, body: r.body, createdAt: r.created_at }));
}

export type AgentActivityEntry = {
  id: string;
  category: string;
  label: string;
  createdAt: string;
};

export async function getAgentActivity(conversationId: string): Promise<AgentActivityEntry[]> {
  const rows = await sql<Array<{ id: string; category: string; label: string; created_at: string }>>`
    select id, category, label, created_at
    from agente_comercial.audit_log
    where conversation_id = ${conversationId}
    order by created_at desc
  `;
  return rows.map((r) => ({ id: r.id, category: r.category, label: r.label, createdAt: r.created_at }));
}

export type ConversationClosingStats = {
  messageCount: number;
  durationMinutes: number | null;
  automatedActions: number;
  humanApprovals: number;
};

export async function getConversationClosingStats(
  conversationId: string,
): Promise<ConversationClosingStats> {
  const [row] = await sql<
    Array<{
      message_count: string;
      duration_minutes: string | null;
      automated_actions: string;
      human_approvals: string;
    }>
  >`
    select
      (select count(*) from agente_comercial.messages where conversation_id = ${conversationId} and sender <> 'system') as message_count,
      (select extract(epoch from (conv.ended_at - conv.started_at)) / 60 from agente_comercial.conversations conv where conv.id = ${conversationId}) as duration_minutes,
      (select count(*) from agente_comercial.audit_log where conversation_id = ${conversationId} and category = 'tool_call') as automated_actions,
      (select count(*) from agente_comercial.approvals where conversation_id = ${conversationId} and status <> 'pending') as human_approvals
  `;
  return {
    messageCount: Number(row.message_count),
    durationMinutes: row.duration_minutes != null ? Math.round(Number(row.duration_minutes)) : null,
    automatedActions: Number(row.automated_actions),
    humanApprovals: Number(row.human_approvals),
  };
}
