import "server-only";
import { sql } from "@/lib/db";

export type OpportunityPriority = "alta" | "media" | "baja";
export type OpportunityStatus =
  | "detectada"
  | "preparada"
  | "contactada"
  | "conversando"
  | "negociando"
  | "esperando_aprobacion"
  | "cerrada"
  | "perdida";

export type OpportunityRow = {
  id: string;
  customerId: string;
  customerName: string;
  signalType: string;
  lastPurchaseDate: string | null;
  daysSinceLastPurchase: number | null;
  avgPurchaseFreqDays: number | null;
  daysOutOfPattern: number | null;
  ticketPromedio: number | null;
  potentialLow: number | null;
  potentialHigh: number | null;
  priority: OpportunityPriority;
  status: OpportunityStatus;
};

export type OpportunityFilters = {
  search?: string;
  priority?: OpportunityPriority;
  status?: OpportunityStatus;
};

export async function listOpportunities(
  filters: OpportunityFilters = {},
): Promise<OpportunityRow[]> {
  const rows = await sql<
    Array<{
      id: string;
      customer_id: string;
      customer_name: string;
      signal_type: string;
      last_purchase_date: string | null;
      days_since_last_purchase: number | null;
      avg_purchase_freq_days: number | null;
      ticket_promedio: string | null;
      potential_low: string | null;
      potential_high: string | null;
      priority: OpportunityPriority;
      status: OpportunityStatus;
    }>
  >`
    select
      o.id,
      o.customer_id,
      c.name as customer_name,
      o.signal_type,
      o.last_purchase_date,
      case when o.last_purchase_date is null then null
        else (current_date - o.last_purchase_date)
      end as days_since_last_purchase,
      c.avg_purchase_freq_days,
      o.ticket_promedio,
      o.potential_low,
      o.potential_high,
      o.priority,
      o.status
    from agente_comercial.opportunities o
    join agente_comercial.customers c on c.id = o.customer_id
    where
      (${filters.search ?? null}::text is null or c.name ilike '%' || ${filters.search ?? null} || '%')
      and (${filters.priority ?? null}::text is null or o.priority = ${filters.priority ?? null})
      and (${filters.status ?? null}::text is null or o.status = ${filters.status ?? null})
    order by
      case o.priority when 'alta' then 0 when 'media' then 1 else 2 end,
      days_since_last_purchase desc nulls last
  `;

  return rows.map((r) => {
    const daysSince = r.days_since_last_purchase;
    const freq = r.avg_purchase_freq_days;
    return {
      id: r.id,
      customerId: r.customer_id,
      customerName: r.customer_name,
      signalType: r.signal_type,
      lastPurchaseDate: r.last_purchase_date,
      daysSinceLastPurchase: daysSince,
      avgPurchaseFreqDays: freq,
      daysOutOfPattern: daysSince != null && freq != null ? daysSince - freq : null,
      ticketPromedio: r.ticket_promedio != null ? Number(r.ticket_promedio) : null,
      potentialLow: r.potential_low != null ? Number(r.potential_low) : null,
      potentialHigh: r.potential_high != null ? Number(r.potential_high) : null,
      priority: r.priority,
      status: r.status,
    };
  });
}

export type DashboardKpis = {
  clientesAnalizados: number;
  oportunidadesDetectadas: number;
  valorPotencial: number;
  conversacionesActivas: number;
  conversacionesCompletadas: number;
  ventasRecuperadas: number;
  excepcionesPendientes: number;
  intervencionHumana: number;
};

export async function getDashboardKpis(): Promise<DashboardKpis> {
  const [row] = await sql<
    Array<{
      clientes_analizados: string;
      oportunidades_detectadas: string;
      valor_potencial: string | null;
      conversaciones_activas: string;
      conversaciones_completadas: string;
      ventas_recuperadas: string | null;
      excepciones_pendientes: string;
      intervencion_humana: string;
    }>
  >`
    select
      (select count(*) from agente_comercial.customers) as clientes_analizados,
      (select count(*) from agente_comercial.opportunities where status <> 'perdida') as oportunidades_detectadas,
      (select coalesce(sum(potential_high), 0) from agente_comercial.opportunities where status not in ('perdida', 'cerrada')) as valor_potencial,
      (select count(*) from agente_comercial.conversations where ended_at is null) as conversaciones_activas,
      (select count(*) from agente_comercial.conversations where ended_at is not null) as conversaciones_completadas,
      (select coalesce(sum(total), 0) from agente_comercial.orders) as ventas_recuperadas,
      (select count(*) from agente_comercial.approvals where status = 'pending') as excepciones_pendientes,
      (select count(*) from agente_comercial.approvals where status <> 'pending') as intervencion_humana
  `;

  return {
    clientesAnalizados: Number(row.clientes_analizados),
    oportunidadesDetectadas: Number(row.oportunidades_detectadas),
    valorPotencial: Number(row.valor_potencial ?? 0),
    conversacionesActivas: Number(row.conversaciones_activas),
    conversacionesCompletadas: Number(row.conversaciones_completadas),
    ventasRecuperadas: Number(row.ventas_recuperadas ?? 0),
    excepcionesPendientes: Number(row.excepciones_pendientes),
    intervencionHumana: Number(row.intervencion_humana),
  };
}
