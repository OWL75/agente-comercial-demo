import "server-only";
import { z } from "zod";
import { sql } from "@/lib/db";
import { getActivePolicy } from "@/lib/db/policies";
import { evaluateDiscount, hasEnoughStock } from "@/lib/policy/evaluate";
import { uuidLike } from "@/lib/zod-helpers";

export const createSandboxOrderInput = z.object({
  conversationId: uuidLike,
  customerId: uuidLike,
  items: z.array(z.object({ sku: z.string(), quantity: z.number().int().positive() })).min(1),
  discountPct: z.number().min(0).max(100).default(0),
  creditTerms: z.string(),
  deliveryOption: z.string(),
});
export type CreateSandboxOrderInput = z.infer<typeof createSandboxOrderInput>;

export async function createSandboxOrder(input: CreateSandboxOrderInput) {
  const policy = await getActivePolicy();
  if (!policy) throw new Error("No hay una política comercial activa configurada");

  // Never trust a discount % the model claims was approved — re-derive the
  // classification and, if it needed a human, require an actual approved
  // row on this conversation before the order can exist.
  const discountCheck = evaluateDiscount(input.discountPct, policy.config.discount);
  if (discountCheck.decision === "denied") {
    throw new Error(
      `Descuento de ${input.discountPct}% excede la política (máximo ${policy.config.discount.approvalMaxPct}%). No se puede crear el pedido.`,
    );
  }
  if (discountCheck.decision === "requires_approval") {
    const [approved] = await sql`
      select decided_value from agente_comercial.approvals
      where conversation_id = ${input.conversationId} and type = 'discount' and status in ('approved', 'modified')
      order by decided_at desc
      limit 1
    `;
    const approvedPct = Number((approved?.decided_value as { pct?: number } | undefined)?.pct ?? NaN);
    if (!approved || !(approvedPct >= input.discountPct)) {
      throw new Error(
        `El descuento de ${input.discountPct}% requiere una aprobación humana registrada antes de crear el pedido.`,
      );
    }
  }

  // Re-fetch price and stock now — never reuse a figure read earlier in the
  // conversation, since it may be stale by the time the order is created.
  const products = await sql`
    select id, sku, name, unit_price, stock
    from agente_comercial.products
    where sku in ${sql(input.items.map((i) => i.sku))}
  `;

  const lines = input.items.map((item) => {
    const product = products.find((p) => p.sku === item.sku);
    if (!product) throw new Error(`Producto con SKU "${item.sku}" no encontrado`);
    if (!hasEnoughStock(product.stock, item.quantity)) {
      throw new Error(
        `Stock insuficiente para ${product.name} (${item.sku}): disponible ${product.stock}, solicitado ${item.quantity}. No se puede confirmar la venta.`,
      );
    }
    return { ...item, productId: product.id as string, unitPrice: Number(product.unit_price), name: product.name };
  });

  const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const total = subtotal * (1 - input.discountPct / 100);

  const [order] = await sql`
    insert into agente_comercial.orders
      (conversation_id, customer_id, subtotal, discount_pct, total, credit_terms, delivery_option, status)
    values (
      ${input.conversationId}, ${input.customerId}, ${subtotal}, ${input.discountPct}, ${total},
      ${input.creditTerms}, ${input.deliveryOption}, 'sandbox_created'
    )
    returning id
  `;

  for (const line of lines) {
    await sql`
      insert into agente_comercial.order_items (order_id, product_id, quantity, unit_price)
      values (${order.id}, ${line.productId}, ${line.quantity}, ${line.unitPrice})
    `;
  }

  await sql`
    update agente_comercial.opportunities
    set status = 'cerrada', updated_at = now()
    where id = (select opportunity_id from agente_comercial.conversations where id = ${input.conversationId})
  `;
  await sql`
    update agente_comercial.conversations set ended_at = now() where id = ${input.conversationId}
  `;

  return {
    orderId: order.id,
    subtotal,
    discountPct: input.discountPct,
    total,
    creditTerms: input.creditTerms,
    deliveryOption: input.deliveryOption,
    items: lines.map((l) => ({ sku: l.sku, name: l.name, quantity: l.quantity, unitPrice: l.unitPrice })),
  };
}
