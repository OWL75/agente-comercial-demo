import "server-only";
import { sql } from "@/lib/db";
import { runAgentTurn, startConversation } from "@/lib/agent/runtime";
import type { ApprovalRow, InsightRow, OrderRow, ScenarioTrace, ToolCall, TurnSnapshot } from "@/lib/qa/objection-checks";

type ConversationState = Omit<TurnSnapshot, "customerMessage" | "reply" | "toolCalls" | "failedCalls"> & {
  allCalls: ToolCall[];
  allFailures: Array<{ tool: string; error: string }>;
};

const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));

/** Reads every commercial effect of a conversation straight from the database. */
export async function readConversationState(conversationId: string): Promise<ConversationState> {
  const audit = await sql<Array<{ payload: { tool?: string; input?: Record<string, unknown>; result?: unknown; error?: string } }>>`
    select payload from agente_comercial.audit_log
    where conversation_id = ${conversationId} and category = 'tool_call'
    order by created_at asc, id asc
  `;
  const [conversation] = await sql<Array<{ stage: string }>>`
    select stage from agente_comercial.conversations where id = ${conversationId}
  `;
  const [insight] = await sql<Array<Record<string, unknown>>>`
    select motivo_inactividad, competidor_mencionado, objecion, producto_interes, cantidad,
      precio_objetivo, condicion_solicitada, intencion_compra, resultado, proxima_accion,
      proxima_fecha::text as proxima_fecha, resumen, opt_out
    from agente_comercial.customer_insights where conversation_id = ${conversationId}
  `;
  const approvals = await sql<ApprovalRow[]>`
    select type, status, requested_value from agente_comercial.approvals
    where conversation_id = ${conversationId} order by created_at asc
  `;
  const orders = await sql<Array<Record<string, unknown>>>`
    select id, subtotal, discount_pct, total, credit_terms, delivery_option
    from agente_comercial.orders where conversation_id = ${conversationId}
  `;
  const orderRows: OrderRow[] = [];
  for (const order of orders) {
    const items = await sql<Array<{ sku: string; quantity: number; unit_price: string }>>`
      select p.sku, oi.quantity, oi.unit_price from agente_comercial.order_items oi
      join agente_comercial.products p on p.id = oi.product_id
      where oi.order_id = ${order.id as string} order by p.sku
    `;
    orderRows.push({
      subtotal: Number(order.subtotal), discount_pct: Number(order.discount_pct), total: Number(order.total),
      credit_terms: order.credit_terms as string, delivery_option: order.delivery_option as string,
      items: items.map((i) => ({ sku: i.sku, quantity: Number(i.quantity), unit_price: Number(i.unit_price) })),
    });
  }
  const [messages] = await sql<Array<{ count: number }>>`
    select count(*)::int as count from agente_comercial.messages
    where conversation_id = ${conversationId} and sender = 'agent'
  `;

  return {
    allCalls: audit.filter((a) => a.payload?.tool && !a.payload.error)
      .map((a) => ({ tool: a.payload.tool!, input: a.payload.input ?? {}, result: a.payload.result })),
    allFailures: audit.filter((a) => a.payload?.tool && a.payload.error)
      .map((a) => ({ tool: a.payload.tool!, error: a.payload.error! })),
    stage: conversation?.stage ?? "desconocida",
    insight: insight
      ? ({ ...insight, cantidad: num(insight.cantidad), precio_objetivo: num(insight.precio_objetivo), opt_out: insight.opt_out === true } as InsightRow)
      : null,
    approvals,
    orders: orderRows,
    agentMessagesAfterTurn: Number(messages?.count ?? 0),
  };
}

/**
 * Runs an optional agent opening plus a list of customer messages through the
 * real runtime, snapshotting the database after every turn.
 */
export async function runTracedConversation(
  conversationId: string,
  options: { opening?: boolean; messages: string[] },
): Promise<ScenarioTrace> {
  const turns: TurnSnapshot[] = [];
  let seenCalls = 0;
  let seenFailures = 0;
  const snapshot = async (customerMessage: string | null, reply: string) => {
    const state = await readConversationState(conversationId);
    const { allCalls, allFailures, ...rest } = state;
    turns.push({ customerMessage, reply, toolCalls: allCalls.slice(seenCalls), failedCalls: allFailures.slice(seenFailures), ...rest });
    seenCalls = allCalls.length;
    seenFailures = allFailures.length;
  };

  if (options.opening) await snapshot(null, (await startConversation(conversationId)).reply);
  for (const message of options.messages) {
    await snapshot(message, (await runAgentTurn(conversationId, message)).reply);
  }
  return { turns };
}
