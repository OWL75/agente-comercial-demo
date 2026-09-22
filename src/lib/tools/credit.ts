import "server-only";
import { z } from "zod";
import { sql } from "@/lib/db";
import { evaluateCredit } from "@/lib/policy/evaluate";
import { getActivePolicy } from "@/lib/db/policies";
import { uuidLike } from "@/lib/zod-helpers";

export const getCreditStatusInput = z.object({
  customerId: uuidLike,
  requestingIncreaseOrNew: z.boolean().default(false),
});
export type GetCreditStatusInput = z.infer<typeof getCreditStatusInput>;

export async function getCreditStatus(input: GetCreditStatusInput) {
  const [customer] = await sql`
    select credit_total, credit_available, payment_terms
    from agente_comercial.customers
    where id = ${input.customerId}
  `;
  if (!customer) throw new Error(`Cliente ${input.customerId} no encontrado`);

  const policy = await getActivePolicy();
  if (!policy) throw new Error("No hay una política comercial activa configurada");

  const decision = evaluateCredit(input.requestingIncreaseOrNew, policy.config.credit);

  return {
    creditTotal: Number(customer.credit_total),
    creditAvailable: Number(customer.credit_available),
    paymentTerms: customer.payment_terms,
    decision: decision.decision,
  };
}
