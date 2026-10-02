import "server-only";
import { sql } from "@/lib/db";

/**
 * Prospects who write "DEMO" get their own sandbox copy of the demo company,
 * marked with this segment. It keeps them out of the owner's panel numbers
 * and Telegram, and lets the manager's decisions be simulated.
 */
export const PROSPECT_SEGMENT = "Prospecto demo";

export async function isProspectConversation(conversationId: string | null | undefined): Promise<boolean> {
  if (!conversationId) return false;
  const [row] = await sql<Array<{ segment: string | null }>>`
    select c.segment from agente_comercial.conversations conv
    join agente_comercial.customers c on c.id = conv.customer_id
    where conv.id = ${conversationId}
  `;
  return row?.segment === PROSPECT_SEGMENT;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * In a prospect's demo nobody is on Telegram: the "manager" approves on his
 * own once Fernán's reply ("lo consulto con Abdiel…") is out, so the prospect
 * sees the whole loop in seconds. Best effort, never throws.
 */
export function scheduleDemoApproval(approvalId: string, conversationId: string, delayMs = 6000): void {
  void (async () => {
    const started = Date.now();
    await sleep(delayMs);
    while (Date.now() - started < 90_000) {
      const [state] = await sql<Array<{ status: string; approval_at: Date; last_sender: string | null; last_at: Date | null }>>`
        select a.status, a.created_at as approval_at, m.sender as last_sender, m.created_at as last_at
        from agente_comercial.approvals a
        left join lateral (
          select sender, created_at from agente_comercial.messages
          where conversation_id = ${conversationId} order by created_at desc limit 1
        ) m on true
        where a.id = ${approvalId}
      `;
      if (!state || state.status !== "pending") return;
      if (state.last_sender === "agent" && state.last_at && state.last_at > state.approval_at) break;
      await sleep(3000);
    }
    const { decideApproval } = await import("@/lib/agent/approval-decision");
    await decideApproval(approvalId, "approve", undefined, "Gerente (demo automática)");
  })().catch((error) => {
    console.error("[demo prospecto] aprobación automática:", error instanceof Error ? error.message : error);
  });
}
