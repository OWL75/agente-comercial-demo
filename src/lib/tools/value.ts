import "server-only";
import { z } from "zod";
import { sql } from "@/lib/db";
import { uuidLike } from "@/lib/zod-helpers";
import { COMPANY_ADVANTAGES } from "@/lib/agent/company-profile";

export const getValuePropositionInput = z.object({ customerId: uuidLike });

const money = (value: number) =>
  `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const monthYear = (date: Date) =>
  new Intl.DateTimeFormat("es-PA", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);

/**
 * Why this customer is better off with Nova than with their current
 * supplier, from verified data only: their account, their usual order and
 * the company advantages approved in company-profile.ts.
 */
export async function getValueProposition(input: z.infer<typeof getValuePropositionInput>) {
  const { customerId } = getValuePropositionInput.parse(input);
  const [customer] = await sql<Array<{ payment_terms: string | null; credit_available: string | number }>>`
    select payment_terms, credit_available from agente_comercial.customers where id = ${customerId}
  `;
  const [history] = await sql<Array<{ orders: number; first: Date | string | null }>>`
    select count(*)::int as orders, min(purchase_date) as first
    from agente_comercial.purchases where customer_id = ${customerId}
  `;
  const [usual] = await sql<Array<{ name: string; quantity: number; stock: number; express: boolean | null }>>`
    select p.name, pi.quantity, p.stock, p.express_eligible as express
    from agente_comercial.purchase_items pi
    join agente_comercial.purchases pu on pu.id = pi.purchase_id
    join agente_comercial.products p on p.id = pi.product_id
    where pu.customer_id = ${customerId}
    order by pu.purchase_date desc, pi.quantity desc
    limit 1
  `;

  const customerFacts: string[] = [];
  if (history?.orders && history.first) {
    customerFacts.push(`Ya nos conoce: ${history.orders} pedidos con nosotros desde ${monthYear(new Date(history.first))}; su pedido habitual se prepara sin volver a explicarlo.`);
  }
  const credit = Number(customer?.credit_available ?? 0);
  if (customer && credit > 0) {
    customerFacts.push(`Su cuenta tiene crédito${customer.payment_terms ? ` a ${customer.payment_terms}` : ""} con ${money(credit)} disponibles: no tiene que pagar por adelantado.`);
  }
  if (usual && Number(usual.stock) >= Number(usual.quantity)) {
    customerFacts.push(`Hay stock para su pedido habitual de ${usual.quantity} unidades de ${usual.name}.`);
  }
  if (usual?.express) customerFacts.push(`${usual.name} califica para entrega al día siguiente.`);

  return {
    customerFacts,
    companyAdvantages: COMPANY_ADVANTAGES,
    guidance: "Usa solo estos puntos. Elige uno o dos que respondan a lo que el cliente valora (precio, entrega, crédito, atención) y dilos con naturalidad, sin una lista larga. Nunca inventes ventajas ni hables mal del competidor.",
  };
}
