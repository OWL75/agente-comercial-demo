import "server-only";
import { z } from "zod";
import { sql } from "@/lib/db";

export const getCustomerProfileInput = z.object({
  customerId: z.string().uuid(),
});
export type GetCustomerProfileInput = z.infer<typeof getCustomerProfileInput>;

export async function getCustomerProfile(input: GetCustomerProfileInput) {
  const [row] = await sql`
    select id, name, segment, avg_purchase_freq_days, avg_ticket, credit_total,
           credit_available, payment_terms, preferred_channel, phone
    from agente_comercial.customers
    where id = ${input.customerId}
  `;
  if (!row) throw new Error(`Cliente ${input.customerId} no encontrado`);
  return row;
}

export const getPurchaseHistoryInput = z.object({
  customerId: z.string().uuid(),
  limit: z.number().int().min(1).max(50).default(10),
});
export type GetPurchaseHistoryInput = z.infer<typeof getPurchaseHistoryInput>;

export async function getPurchaseHistory(input: GetPurchaseHistoryInput) {
  const purchases = await sql`
    select id, purchase_date, amount
    from agente_comercial.purchases
    where customer_id = ${input.customerId}
    order by purchase_date desc
    limit ${input.limit}
  `;
  const items = await sql`
    select pi.purchase_id, p.sku, p.name, pi.quantity, pi.unit_price
    from agente_comercial.purchase_items pi
    join agente_comercial.products p on p.id = pi.product_id
    where pi.purchase_id in ${sql(purchases.map((p) => p.id))}
  `;
  return purchases.map((purchase) => ({
    ...purchase,
    items: items.filter((i) => i.purchase_id === purchase.id),
  }));
}

export const getCustomerOpportunityInput = z.object({
  customerId: z.string().uuid(),
});
export type GetCustomerOpportunityInput = z.infer<typeof getCustomerOpportunityInput>;

export async function getCustomerOpportunity(input: GetCustomerOpportunityInput) {
  const [row] = await sql`
    select id, signal_type, last_purchase_date,
      case when last_purchase_date is null then null else (current_date - last_purchase_date) end as days_since_last_purchase,
      ticket_promedio, potential_low, potential_high, priority, status, reason_text, strategy_text
    from agente_comercial.opportunities
    where customer_id = ${input.customerId}
    order by detected_at desc
    limit 1
  `;
  if (!row) throw new Error(`No hay oportunidad registrada para el cliente ${input.customerId}`);
  return row;
}

export const saveCustomerInsightInput = z.object({
  conversationId: z.string().uuid(),
  customerId: z.string().uuid(),
  motivoInactividad: z.string().nullable().optional(),
  competidorMencionado: z.string().nullable().optional(),
  objecion: z.string().nullable().optional(),
  productoInteres: z.string().nullable().optional(),
  cantidad: z.number().int().nullable().optional(),
  precioObjetivo: z.number().nullable().optional(),
  condicionSolicitada: z.string().nullable().optional(),
  intencionCompra: z.string().nullable().optional(),
  resultado: z.string().nullable().optional(),
  proximaAccion: z.string().nullable().optional(),
  proximaFecha: z.string().nullable().optional(),
  resumen: z.string().nullable().optional(),
  optOut: z.boolean().default(false),
});
export type SaveCustomerInsightInput = z.infer<typeof saveCustomerInsightInput>;

export async function saveCustomerInsight(input: SaveCustomerInsightInput) {
  const [existing] = await sql`
    select id from agente_comercial.customer_insights where conversation_id = ${input.conversationId}
  `;

  const values = {
    motivo_inactividad: input.motivoInactividad ?? null,
    competidor_mencionado: input.competidorMencionado ?? null,
    objecion: input.objecion ?? null,
    producto_interes: input.productoInteres ?? null,
    cantidad: input.cantidad ?? null,
    precio_objetivo: input.precioObjetivo ?? null,
    condicion_solicitada: input.condicionSolicitada ?? null,
    intencion_compra: input.intencionCompra ?? null,
    resultado: input.resultado ?? null,
    proxima_accion: input.proximaAccion ?? null,
    proxima_fecha: input.proximaFecha ?? null,
    resumen: input.resumen ?? null,
    opt_out: input.optOut,
  };

  if (existing) {
    const [row] = await sql`
      update agente_comercial.customer_insights
      set ${sql(values)}
      where id = ${existing.id}
      returning id
    `;
    return { id: row.id, updated: true };
  }

  const [row] = await sql`
    insert into agente_comercial.customer_insights ${sql({
      conversation_id: input.conversationId,
      customer_id: input.customerId,
      ...values,
    })}
    returning id
  `;
  return { id: row.id, updated: false };
}
