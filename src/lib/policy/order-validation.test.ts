import { describe, it, expect } from "vitest";
import { aggregateItems, moneyTotals, validateOrderConditions, type ScopedApproval } from "./order-validation";

const line = { sku: "CAP-001", quantity: 200, unitPrice: 18.5, expressEligible: false };
const policy = { version: 1, config: {
  discount: { autoMaxPct: 5, approvalMaxPct: 10 },
  credit: { existingConditionAuto: true, increaseRequiresApproval: true },
  delivery: { standardHours: 48, expressHours: 24, expressRequiresEligibleStock: true, extraordinaryRequiresApproval: true },
  stock: { neverConfirmWithoutCheck: true },
} };
function args() {
  return { lines: [{ ...line }], discountPct: 0, creditTerms: "30 días", deliveryHours: 48, total: 3700,
    customer: { paymentTerms: "30 días", creditAvailable: 14500 }, policy: structuredClone(policy), approvals: [] as ScopedApproval[] };
}
function approval(type = "discount", decided_value: ScopedApproval["decided_value"] = { pct: 8 }): ScopedApproval {
  return { type, status: "approved", requested_value: { productSku: "CAP-001", quantity: 200 },
    decided_value, context: { unitPrice: 18.5, policyVersion: 1 } };
}

describe("server-side order conditions", () => {
  it("permits the existing condition and standard delivery", () => expect(() => validateOrderConditions(args())).not.toThrow());
  it("permits an autonomous 4% discount", () => expect(() => validateOrderConditions({ ...args(), discountPct: 4 })).not.toThrow());
  it("rejects an 8% discount without approval", () => expect(() => validateOrderConditions({ ...args(), discountPct: 8 })).toThrow("aprobación"));
  it("permits the exact approved deal", () => expect(() => validateOrderConditions({ ...args(), discountPct: 8, approvals: [approval()] })).not.toThrow());
  it.each(["sku", "quantity", "price", "policy", "pct", "status"])("rejects changed %s", (field) => {
    const input = { ...args(), discountPct: 8, approvals: [approval()] };
    if (field === "sku") input.lines[0].sku = "CAP-002";
    if (field === "quantity") input.lines[0].quantity = 201;
    if (field === "price") input.lines[0].unitPrice = 19;
    if (field === "policy") input.policy.version = 2;
    if (field === "pct") input.discountPct = 7;
    if (field === "status") input.approvals[0].status = "rejected";
    expect(() => validateOrderConditions(input)).toThrow("aprobación");
  });
  it("rejects out-of-policy discounts even with approval", () => expect(() => validateOrderConditions({ ...args(), discountPct: 15, approvals: [approval("discount", { pct: 15 })] })).toThrow("política"));
  it("rejects unapproved credit terms", () => expect(() => validateOrderConditions({ ...args(), creditTerms: "90 días" })).toThrow("plazo"));
  it("rejects insufficient credit", () => expect(() => validateOrderConditions({ ...args(), total: 15000 })).toThrow("Crédito"));
  it("accepts scoped credit increase", () => expect(() => validateOrderConditions({ ...args(), total: 15000, approvals: [approval("credit", { amount: 500 })] })).not.toThrow());
  it("rejects non-eligible express delivery", () => expect(() => validateOrderConditions({ ...args(), deliveryHours: 24 })).toThrow("entrega"));
  it("accepts eligible express stock", () => expect(() => validateOrderConditions({ ...args(), lines: [{ ...line, expressEligible: true }], deliveryHours: 24 })).not.toThrow());
  it("accepts an exact delivery approval", () => expect(() => validateOrderConditions({ ...args(), deliveryHours: 12, approvals: [approval("delivery", { hours: 12 })] })).not.toThrow());
  it("rejects multi-product exceptions until quote versioning exists", () => expect(() => validateOrderConditions({ ...args(), lines: [line, { ...line, sku: "CAP-002" }], discountPct: 8, approvals: [approval()] })).toThrow("aprobación"));
});

describe("quantities and currency", () => {
  it("aggregates duplicate SKUs before stock validation", () => expect(aggregateItems([{ sku: "A", quantity: 60 }, { sku: "A", quantity: 60 }])).toEqual([{ sku: "A", quantity: 120 }]));
  it("calculates the demo order exactly", () => expect(moneyTotals([line], 8)).toEqual({ subtotal: 3700, total: 3404 }));
  it("rounds fractional cents once at the order level", () => expect(moneyTotals([{ ...line, quantity: 1, unitPrice: 0.1 }], 5).total).toBe(0.1));
  it.each([NaN, Infinity, -1, 101, 4.123])("rejects invalid discounts %s", (pct) => expect(() => moneyTotals([line], pct)).toThrow());
  it("rejects invalid catalog prices", () => expect(() => moneyTotals([{ ...line, unitPrice: NaN }], 0)).toThrow());
});
