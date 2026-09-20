import type { CommercialPolicyConfig } from "@/lib/db/policies";

export type DiscountDecision = {
  decision: "auto_approve" | "requires_approval" | "denied";
  requestedPct: number;
  autoMaxPct: number;
  approvalMaxPct: number;
  maxApprovable: number;
};

/**
 * The model never decides where a requested discount falls — this function
 * does, from the real policy config, and the tool layer returns only the
 * result. That keeps the boundary (5% / 10%) a system fact, not something
 * the LLM computes or could be talked out of.
 */
export function evaluateDiscount(
  requestedPct: number,
  config: CommercialPolicyConfig["discount"],
): DiscountDecision {
  const base = {
    requestedPct,
    autoMaxPct: config.autoMaxPct,
    approvalMaxPct: config.approvalMaxPct,
    maxApprovable: config.approvalMaxPct,
  };
  if (requestedPct <= config.autoMaxPct) return { ...base, decision: "auto_approve" };
  if (requestedPct <= config.approvalMaxPct) return { ...base, decision: "requires_approval" };
  return { ...base, decision: "denied" };
}

export type CreditDecision = {
  decision: "auto_approve" | "requires_approval";
  reason: "existing_condition" | "increase_or_new";
};

export function evaluateCredit(
  isIncreaseOrNew: boolean,
  config: CommercialPolicyConfig["credit"],
): CreditDecision {
  if (!isIncreaseOrNew) {
    return {
      decision: config.existingConditionAuto ? "auto_approve" : "requires_approval",
      reason: "existing_condition",
    };
  }
  return {
    decision: config.increaseRequiresApproval ? "requires_approval" : "auto_approve",
    reason: "increase_or_new",
  };
}

export type DeliveryDecision = {
  decision: "auto_approve" | "requires_approval";
  reason: "estandar" | "express_elegible" | "express_no_elegible" | "extraordinaria";
};

export function evaluateDelivery(
  requestedHours: number,
  productExpressEligible: boolean,
  config: CommercialPolicyConfig["delivery"],
): DeliveryDecision {
  if (requestedHours >= config.standardHours) return { decision: "auto_approve", reason: "estandar" };
  if (requestedHours === config.expressHours) {
    return productExpressEligible
      ? { decision: "auto_approve", reason: "express_elegible" }
      : { decision: "requires_approval", reason: "express_no_elegible" };
  }
  return { decision: "requires_approval", reason: "extraordinaria" };
}

export function hasEnoughStock(stock: number, requestedQuantity: number): boolean {
  return stock >= requestedQuantity;
}
