import "server-only";
import { z } from "zod";
import { getActivePolicy } from "@/lib/db/policies";
import { evaluateDiscount } from "@/lib/policy/evaluate";

export const getDiscountPolicyInput = z.object({
  requestedPct: z.number().min(0).max(100).optional(),
});
export type GetDiscountPolicyInput = z.infer<typeof getDiscountPolicyInput>;

export async function getDiscountPolicy(input: GetDiscountPolicyInput) {
  const policy = await getActivePolicy();
  if (!policy) throw new Error("No hay una política comercial activa configurada");

  const { discount } = policy.config;
  if (input.requestedPct == null) {
    return { autoMaxPct: discount.autoMaxPct, approvalMaxPct: discount.approvalMaxPct };
  }
  return evaluateDiscount(input.requestedPct, discount);
}
