import "server-only";
import { sql } from "@/lib/db";
import type { OpportunityPriority, OpportunityStatus } from "@/lib/db/opportunities";

export type OpportunityDetail = {
  id: string;
  customerId: string;
  customerName: string;
  segment: string | null;
  avgPurchaseFreqDays: number | null;
  avgTicket: number | null;
  creditTotal: number | null;
  creditAvailable: number | null;
  paymentTerms: string | null;
  preferredChannel: string | null;
  phone: string | null;
  signalType: string;
  lastPurchaseDate: string | null;
  daysSinceLastPurchase: number | null;
  daysOutOfPattern: number | null;
  ticketPromedio: number | null;
  potentialLow: number | null;
  potentialHigh: number | null;
  priority: OpportunityPriority;
  status: OpportunityStatus;
  reasonText: string | null;
  strategyText: string | null;
};

export async function getOpportunityDetail(id: string): Promise<OpportunityDetail | null> {
  const [row] = await sql<
    Array<{
      id: string;
      customer_id: string;
      customer_name: string;
      segment: string | null;
      avg_purchase_freq_days: number | null;
      avg_ticket: string | null;
      credit_total: string | null;
      credit_available: string | null;
      payment_terms: string | null;
      preferred_channel: string | null;
      phone: string | null;
      signal_type: string;
      last_purchase_date: string | null;
      days_since_last_purchase: number | null;
      ticket_promedio: string | null;
      potential_low: string | null;
      potential_high: string | null;
      priority: OpportunityPriority;
      status: OpportunityStatus;
      reason_text: string | null;
      strategy_text: string | null;
    }>
  >`
    select
      o.id,
      c.id as customer_id,
      c.name as customer_name,
      c.segment,
      c.avg_purchase_freq_days,
      c.avg_ticket,
      c.credit_total,
      c.credit_available,
      c.payment_terms,
      c.preferred_channel,
      c.phone,
      o.signal_type,
      o.last_purchase_date,
      case when o.last_purchase_date is null then null
        else (current_date - o.last_purchase_date)
      end as days_since_last_purchase,
      o.ticket_promedio,
      o.potential_low,
      o.potential_high,
      o.priority,
      o.status,
      o.reason_text,
      o.strategy_text
    from agente_comercial.opportunities o
    join agente_comercial.customers c on c.id = o.customer_id
    where o.id = ${id}
  `;

  if (!row) return null;

  const daysSince = row.days_since_last_purchase;
  const freq = row.avg_purchase_freq_days;

  return {
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    segment: row.segment,
    avgPurchaseFreqDays: freq,
    avgTicket: row.avg_ticket != null ? Number(row.avg_ticket) : null,
    creditTotal: row.credit_total != null ? Number(row.credit_total) : null,
    creditAvailable: row.credit_available != null ? Number(row.credit_available) : null,
    paymentTerms: row.payment_terms,
    preferredChannel: row.preferred_channel,
    phone: row.phone,
    signalType: row.signal_type,
    lastPurchaseDate: row.last_purchase_date,
    daysSinceLastPurchase: daysSince,
    daysOutOfPattern: daysSince != null && freq != null ? daysSince - freq : null,
    ticketPromedio: row.ticket_promedio != null ? Number(row.ticket_promedio) : null,
    potentialLow: row.potential_low != null ? Number(row.potential_low) : null,
    potentialHigh: row.potential_high != null ? Number(row.potential_high) : null,
    priority: row.priority,
    status: row.status,
    reasonText: row.reason_text,
    strategyText: row.strategy_text,
  };
}

export type PurchaseHistoryRow = {
  id: string;
  purchaseDate: string;
  amount: number;
};

export async function getPurchaseHistory(
  customerId: string,
  limit = 6,
): Promise<PurchaseHistoryRow[]> {
  const rows = await sql<Array<{ id: string; purchase_date: string; amount: string }>>`
    select id, purchase_date, amount
    from agente_comercial.purchases
    where customer_id = ${customerId}
    order by purchase_date desc
    limit ${limit}
  `;
  return rows.map((r) => ({ id: r.id, purchaseDate: r.purchase_date, amount: Number(r.amount) }));
}

export type FrequentProductRow = {
  productId: string;
  sku: string;
  name: string;
  totalQuantity: number;
  totalRevenue: number;
};

export async function getFrequentProducts(
  customerId: string,
  limit = 4,
): Promise<FrequentProductRow[]> {
  const rows = await sql<
    Array<{ product_id: string; sku: string; name: string; total_quantity: string; total_revenue: string }>
  >`
    select
      p.id as product_id,
      p.sku,
      p.name,
      sum(pi.quantity) as total_quantity,
      sum(pi.quantity * pi.unit_price) as total_revenue
    from agente_comercial.purchase_items pi
    join agente_comercial.purchases pu on pu.id = pi.purchase_id
    join agente_comercial.products p on p.id = pi.product_id
    where pu.customer_id = ${customerId}
    group by p.id, p.sku, p.name
    order by total_quantity desc
    limit ${limit}
  `;
  return rows.map((r) => ({
    productId: r.product_id,
    sku: r.sku,
    name: r.name,
    totalQuantity: Number(r.total_quantity),
    totalRevenue: Number(r.total_revenue),
  }));
}
