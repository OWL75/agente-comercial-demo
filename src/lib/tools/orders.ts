import "server-only";
import { z } from "zod";
import { sql } from "@/lib/db";
import type { CommercialPolicyConfig } from "@/lib/db/policies";
import { aggregateItems, moneyTotals, validateOrderConditions, type ScopedApproval } from "@/lib/policy/order-validation";
import { uuidLike } from "@/lib/zod-helpers";

export const createSandboxOrderInput = z.object({
  conversationId: uuidLike,
  customerId: uuidLike,
  items: z.array(z.object({ sku: z.string().trim().min(1), quantity: z.number().int().positive() })).min(1).max(100),
  discountPct: z.number().min(0).max(100).default(0),
  creditTerms: z.string().min(1).describe("Condición exacta devuelta por get_credit_status; no inventar ni cambiar el plazo."),
  deliveryHours: z.number().int().positive().describe("Horas exactas consultadas en get_delivery_options o aprobadas por un humano."),
});
export type CreateSandboxOrderInput = z.infer<typeof createSandboxOrderInput>;

export async function createSandboxOrder(rawInput: CreateSandboxOrderInput) {
  const input = createSandboxOrderInput.parse(rawInput);
  const items = aggregateItems(input.items);
  return sql.begin(async (tx) => {
    // Lock order: conversation -> customer -> policy -> sorted products.
    // External API calls must never run inside this transaction.
    const [conversation] = await tx`
      select id, opportunity_id, ended_at from agente_comercial.conversations
      where id = ${input.conversationId} and customer_id = ${input.customerId} for update
    `;
    if (!conversation) throw new Error("Cliente y conversación no coinciden.");
    const [existing] = await tx`select id from agente_comercial.orders where conversation_id = ${input.conversationId} limit 1`;
    if (existing) throw new Error(`Esta conversación ya tiene el pedido ${existing.id}. No se creará otro.`);
    if (conversation.ended_at) throw new Error("La conversación ya terminó.");
    const [customer] = await tx`
      select payment_terms, credit_available from agente_comercial.customers where id = ${input.customerId} for update
    `;
    if (!customer) throw new Error("Cliente no encontrado.");
    const [suppression] = await tx`
      select id from agente_comercial.customer_insights where customer_id = ${input.customerId} and opt_out = true limit 1
    `;
    if (suppression) throw new Error("Cliente excluido por opt-out.");
    const [policy] = await tx<Array<{ version: number; config: CommercialPolicyConfig }>>`
      select version, config from agente_comercial.commercial_policies where is_active = true
      order by version desc limit 1 for share
    `;
    if (!policy) throw new Error("No hay política comercial activa.");
    const products = await tx`
      select id, sku, name, unit_price, stock, express_eligible from agente_comercial.products
      where sku in ${tx(items.map((i) => i.sku))} order by sku for share
    `;
    const lines = items.map((item) => {
      const product = products.find((p) => p.sku === item.sku);
      if (!product) throw new Error(`Producto ${item.sku} no encontrado.`);
      if (!Number.isFinite(Number(product.stock)) || Number(product.stock) < item.quantity) {
        throw new Error(`Stock insuficiente para ${item.sku}.`);
      }
      return { ...item, productId: product.id as string, name: product.name as string,
        unitPrice: Number(product.unit_price), expressEligible: product.express_eligible === true };
    });
    const { subtotal, total } = moneyTotals(lines, input.discountPct);
    // Latest request per type wins; never reuse an older approval after a rejection.
    const approvals = await tx<ScopedApproval[]>`
      select distinct on (type) type, status, requested_value, decided_value, context
      from agente_comercial.approvals
      where conversation_id = ${input.conversationId} and customer_id = ${input.customerId}
      order by type, created_at desc, id desc
    `;
    validateOrderConditions({ ...input, lines, total, policy, approvals,
      customer: { paymentTerms: customer.payment_terms, creditAvailable: Number(customer.credit_available) } });
    const deliveryOption = `${input.deliveryHours} horas`;
    const [order] = await tx`
      insert into agente_comercial.orders
        (conversation_id, customer_id, subtotal, discount_pct, total, credit_terms, delivery_option, status)
      values (${input.conversationId}, ${input.customerId}, ${subtotal}, ${input.discountPct}, ${total},
        ${customer.payment_terms}, ${deliveryOption}, 'sandbox_created') returning id
    `;
    for (const line of lines) {
      await tx`insert into agente_comercial.order_items (order_id, product_id, quantity, unit_price)
        values (${order.id}, ${line.productId}, ${line.quantity}, ${line.unitPrice})`;
    }
    await tx`update agente_comercial.opportunities set status = 'cerrada', updated_at = now()
      where id = ${conversation.opportunity_id}`;
    await tx`update agente_comercial.conversations set ended_at = now(), stage = 'closed' where id = ${input.conversationId}`;
    await tx`insert into agente_comercial.audit_log (conversation_id, category, label, payload)
      values (${input.conversationId}, 'order_created', 'Pedido sandbox validado y creado',
        ${tx.json({ orderId: order.id, policyVersion: policy.version, total })})`;
    // Sandbox only: no stock/credit reservation and no ERP side effect.
    return { orderId: order.id, subtotal, discountPct: input.discountPct, total,
      creditTerms: customer.payment_terms, deliveryOption,
      items: lines.map(({ sku, name, quantity, unitPrice }) => ({ sku, name, quantity, unitPrice })) };
  });
}
