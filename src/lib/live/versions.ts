import "server-only";
import { sql } from "@/lib/db";

/**
 * A fingerprint of everything the panel shows: messages, agent activity,
 * approvals, conversations, opportunities and orders. It changes whenever
 * any of them does, so one cheap query tells every open panel to refresh.
 * Stage and payment changes are always logged to audit_log, so they are
 * covered by its count and latest timestamp.
 */
export async function workspaceVersion(): Promise<string> {
  const [row] = await sql<Array<{ v: string }>>`
    select md5(concat_ws('|',
      (select count(*) || ':' || coalesce(max(created_at)::text, '') from agente_comercial.messages),
      (select count(*) || ':' || coalesce(max(created_at)::text, '') from agente_comercial.audit_log),
      (select count(*) || ':' || count(*) filter (where status = 'pending') || ':' || coalesce(max(decided_at)::text, '')
         from agente_comercial.approvals),
      (select count(*) || ':' || count(*) filter (where ended_at is null) from agente_comercial.conversations),
      (select count(*) || ':' || coalesce(max(updated_at)::text, '') from agente_comercial.opportunities),
      (select count(*) || ':' || coalesce(string_agg(status, ',' order by id), '') from agente_comercial.orders)
    )) as v
  `;
  return row.v;
}
