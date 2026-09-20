import "server-only";
import { z } from "zod";
import { sql } from "@/lib/db";
import { evaluateDelivery } from "@/lib/policy/evaluate";
import { getActivePolicy } from "@/lib/db/policies";

export const getDeliveryOptionsInput = z.object({
  sku: z.string().optional(),
});
export type GetDeliveryOptionsInput = z.infer<typeof getDeliveryOptionsInput>;

export async function getDeliveryOptions(input: GetDeliveryOptionsInput) {
  const policy = await getActivePolicy();
  if (!policy) throw new Error("No hay una política comercial activa configurada");

  let expressEligible = false;
  if (input.sku) {
    const [product] = await sql`
      select express_eligible from agente_comercial.products where sku = ${input.sku}
    `;
    if (!product) throw new Error(`Producto con SKU "${input.sku}" no encontrado`);
    expressEligible = product.express_eligible;
  }

  const { delivery } = policy.config;
  return {
    standard: { hours: delivery.standardHours, decision: "auto_approve" as const },
    express: {
      hours: delivery.expressHours,
      decision: evaluateDelivery(delivery.expressHours, expressEligible, delivery).decision,
    },
    extraordinaryRequiresApproval: delivery.extraordinaryRequiresApproval,
  };
}
