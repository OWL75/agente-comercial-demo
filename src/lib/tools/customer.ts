import "server-only";
import { z } from "zod";
import { sql } from "@/lib/db";
import { uuidLike } from "@/lib/zod-helpers";
import { buildInsightPatchWithRejections } from "@/lib/policy/insight-patch";
import { INSIGHT_OUTCOMES, OBJECTION_TYPES } from "@/lib/agent/sales-playbook";

export const getCustomerProfileInput = z.object({
  customerId: uuidLike,
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
  customerId: uuidLike,
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
  if (purchases.length === 0) return [];
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
  customerId: uuidLike,
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
  conversationId: uuidLike,
  customerId: uuidLike,
  motivoInactividad: z.string().nullable().optional(),
  competidorMencionado: z.string().nullable().optional(),
  objecion: z.string().nullable().optional().describe(`Formato "tipo: detalle". Tipos: ${OBJECTION_TYPES.join(", ")}.`),
  productoInteres: z.string().nullable().optional(),
  cantidad: z.number().int().nullable().optional(),
  precioObjetivo: z.number().nullable().optional().describe("Precio por unidad de referencia: el de su proveedor actual o el que pide."),
  condicionSolicitada: z.string().nullable().optional(),
  intencionCompra: z.string().nullable().optional(),
  resultado: z.string().nullable().optional().describe(`Uno de: ${INSIGHT_OUTCOMES.join(", ")}.`),
  proximaAccion: z.string().nullable().optional().describe("Siguiente paso acordado con el cliente."),
  proximaFecha: z.string().nullable().optional().describe("Fecha del próximo contacto en formato AAAA-MM-DD. Solo si el cliente lo autorizó."),
  resumen: z.string().nullable().optional(),
  optOut: z.boolean().optional(),
});
export type SaveCustomerInsightInput = z.infer<typeof saveCustomerInsightInput>;

export async function saveCustomerInsight(input: SaveCustomerInsightInput) {
  input = saveCustomerInsightInput.parse(input);
  const { values, rejected } = buildInsightPatchWithRejections(input);
  const warnings = rejected.length > 0
    ? { rejected: rejected.map((r) => `${r.field} no se guardó: ${r.reason}. Vuelve a enviarlo corregido.`) }
    : {};
  return sql.begin(async (tx) => {
    // Serialize insight writes; do not keep a transaction open during model/API calls.
    const [conversation] = await tx`
      select id from agente_comercial.conversations
      where id = ${input.conversationId} and customer_id = ${input.customerId} for update
    `;
    if (!conversation) throw new Error("Cliente y conversación no coinciden.");
    await tx`select id from agente_comercial.customers where id = ${input.customerId} for update`;
    const [existing] = await tx`
      select id from agente_comercial.customer_insights where conversation_id = ${input.conversationId}
    `;
    if (existing) {
      if (Object.keys(values).length === 0) return { id: existing.id, updated: false, ...warnings };
      await tx`update agente_comercial.customer_insights set ${tx(values)} where id = ${existing.id}`;
      return { id: existing.id, updated: true, ...warnings };
    }
    const [row] = await tx`
      insert into agente_comercial.customer_insights ${tx({
        conversation_id: input.conversationId, customer_id: input.customerId,
        opt_out: false, ...values,
      })} returning id
    `;
    return { id: row.id, updated: false, ...warnings };
  });
}
