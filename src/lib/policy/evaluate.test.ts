import { describe, expect, it } from "vitest";
import { evaluateCredit, evaluateDelivery, evaluateDiscount, hasEnoughStock } from "@/lib/policy/evaluate";

const discountConfig = { autoMaxPct: 5, approvalMaxPct: 10 };
const creditConfig = { existingConditionAuto: true, increaseRequiresApproval: true };
const deliveryConfig = {
  standardHours: 48,
  expressHours: 24,
  expressRequiresEligibleStock: true,
  extraordinaryRequiresApproval: true,
};

describe("evaluateDiscount", () => {
  // Escenario 4: 4% — el agente debe poder operar de forma autónoma.
  it("auto-approves at or below the autonomy threshold", () => {
    expect(evaluateDiscount(4, discountConfig).decision).toBe("auto_approve");
    expect(evaluateDiscount(5, discountConfig).decision).toBe("auto_approve");
  });

  // Escenario 5: 8% — debe generar una aprobación humana.
  it("requires approval between the autonomy and approval ceilings", () => {
    const result = evaluateDiscount(8, discountConfig);
    expect(result.decision).toBe("requires_approval");
    expect(result.maxApprovable).toBe(10);
  });

  it("requires approval exactly at the approval ceiling", () => {
    expect(evaluateDiscount(10, discountConfig).decision).toBe("requires_approval");
  });

  // Escenario 6: 15% — no debe aprobarse automáticamente ni quedar pendiente.
  it("denies anything above the approval ceiling", () => {
    expect(evaluateDiscount(15, discountConfig).decision).toBe("denied");
  });
});

describe("evaluateCredit", () => {
  it("keeps an existing condition autonomous", () => {
    expect(evaluateCredit(false, creditConfig).decision).toBe("auto_approve");
  });

  // Escenario 7: solicitud de más crédito — debe generar una excepción.
  it("always requires approval for a new or increased credit line", () => {
    expect(evaluateCredit(true, creditConfig).decision).toBe("requires_approval");
  });
});

describe("evaluateDelivery", () => {
  it("auto-approves the standard delivery window", () => {
    expect(evaluateDelivery(48, false, deliveryConfig).decision).toBe("auto_approve");
  });

  it("auto-approves express delivery only when the product is eligible", () => {
    expect(evaluateDelivery(24, true, deliveryConfig).decision).toBe("auto_approve");
    expect(evaluateDelivery(24, false, deliveryConfig).decision).toBe("requires_approval");
  });

  it("treats anything faster than express as extraordinary", () => {
    expect(evaluateDelivery(12, true, deliveryConfig).decision).toBe("requires_approval");
    expect(evaluateDelivery(12, true, deliveryConfig).reason).toBe("extraordinaria");
  });
});

describe("hasEnoughStock", () => {
  // Escenario 8: no existe stock suficiente — no debe confirmarse como si existiera.
  it("rejects a quantity greater than available stock", () => {
    expect(hasEnoughStock(95, 200)).toBe(false);
  });

  it("accepts a quantity within available stock", () => {
    expect(hasEnoughStock(820, 200)).toBe(true);
  });
});
