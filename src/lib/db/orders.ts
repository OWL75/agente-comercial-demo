import "server-only";
import { sql } from "@/lib/db";

export type OrderItem = {
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
};

export type OrderSummary = {
  id: string;
  customerName: string;
  subtotal: number;
  discountPct: number;
  total: number;
  creditTerms: string | null;
  deliveryOption: string | null;
  status: string;
  createdAt: string;
  items: OrderItem[];
};

export async function getOrderForConversation(conversationId: string): Promise<OrderSummary | null> {
  const [order] = await sql<
    Array<{
      id: string;
      customer_name: string;
      subtotal: string;
      discount_pct: string;
      total: string;
      credit_terms: string | null;
      delivery_option: string | null;
      status: string;
      created_at: string;
    }>
  >`
    select o.id, c.name as customer_name, o.subtotal, o.discount_pct, o.total, o.credit_terms, o.delivery_option, o.status, o.created_at
    from agente_comercial.orders o
    join agente_comercial.customers c on c.id = o.customer_id
    where o.conversation_id = ${conversationId}
    order by o.created_at desc
    limit 1
  `;
  if (!order) return null;

  const items = await sql<Array<{ sku: string; name: string; quantity: number; unit_price: string }>>`
    select p.sku, p.name, oi.quantity, oi.unit_price
    from agente_comercial.order_items oi
    join agente_comercial.products p on p.id = oi.product_id
    where oi.order_id = ${order.id}
  `;

  return {
    id: order.id,
    customerName: order.customer_name,
    subtotal: Number(order.subtotal),
    discountPct: Number(order.discount_pct),
    total: Number(order.total),
    creditTerms: order.credit_terms,
    deliveryOption: order.delivery_option,
    status: order.status,
    createdAt: order.created_at,
    items: items.map((i) => ({ sku: i.sku, name: i.name, quantity: i.quantity, unitPrice: Number(i.unit_price) })),
  };
}
