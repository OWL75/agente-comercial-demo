import { describe, expect, it } from "vitest";
import { commercialReplyViolations, presentsFinalVerifiedOffer } from "./commercial-reply-guard";
import type { VerifiedOfferResult } from "@/lib/tools/offers";

const ready: VerifiedOfferResult = {
  status: "ready",
  sku: "CAP-001",
  productName: "Shampoo Professional 1L",
  quantity: 50,
  listUnitPrice: 18.5,
  discountPct: 4,
  netUnitPrice: 17.76,
  subtotal: 925,
  total: 888,
  stockAvailable: 820,
  creditAvailable: 12000,
  creditTerms: "30 días",
  deliveryHours: 24,
  deliveryEligible: true,
  policyVersion: 1,
  approvalsNeeded: [],
  roundingRule: "round_net_unit_to_cent_then_multiply",
};

function violations(reply: string, offer: VerifiedOfferResult | null = null, pending = false) {
  return commercialReplyViolations({ reply, verifiedOffer: offer, hasPendingApproval: pending, orderCreated: false });
}

describe("deterministic commercial reply guard", () => {
  it("allows repeating the competitor price as the customer's reference", () => {
    expect(violations("Entiendo que actualmente pagas aproximadamente $17.75 con tu proveedor.")).toEqual([]);
  });

  it("negative trace: blocks turning $17.75 into our unverified offer", () => {
    expect(violations("Puedo ofrecerte $17.75 por unidad.")).toContain("commercial_terms_without_verified_offer");
  });

  it("negative trace: blocks the observed 4.06% / $17.75 / $887.45 inconsistency", () => {
    expect(violations("Te ofrezco 4.06%: $17.75 por unidad, total $887.45. ¿Confirmas?", ready)).toEqual(
      expect.arrayContaining(["offer_money_mismatch", "offer_discount_mismatch"]),
    );
  });

  it("accepts the single rounding rule: 4%, $17.76 and $888.00", () => {
    const reply = "La oferta final es 4%: $17.76 por unidad y total $888.00. ¿Confirmas el pedido?";
    expect(violations(reply, ready)).toEqual([]);
    expect(presentsFinalVerifiedOffer(reply, ready)).toBe(true);
  });

  it("blocks using verified numbers in the wrong unit/total roles", () => {
    expect(violations("La oferta es $888.00 por unidad y total $17.76. ¿Confirmas?", ready)).toEqual(
      expect.arrayContaining(["offer_unit_price_mismatch", "offer_total_mismatch"]),
    );
  });

  it("negative trace: blocks a 24-hour promise and final confirmation while approval is pending", () => {
    expect(violations("Confirmé la entrega express en 24 horas. ¿Confirmas el pedido?", {
      ...ready, status: "approval_required", approvalsNeeded: ["delivery"],
    }, true)).toEqual(expect.arrayContaining([
      "confirmation_requested_with_pending_approval",
      "delivery_promised_with_pending_approval",
      "firm_offer_not_ready",
    ]));
  });

  it("negative trace: blocks invented delivery guarantees", () => {
    expect(violations("Te garantizo que nunca volverá a ocurrir un atraso.")).toContain("invented_delivery_guarantee");
  });
});

describe("confirmation requests in usted", () => {
  it("recognizes the agent asking to confirm in usted and tú", async () => {
    const { asksForConfirmation } = await import("@/lib/agent/commercial-reply-guard");
    expect(asksForConfirmation("¿Confirma el pedido en estas condiciones?")).toBe(true);
    expect(asksForConfirmation("¿Me confirma si lo ingreso?")).toBe(true);
    expect(asksForConfirmation("¿Confirmas el pedido?")).toBe(true);
    expect(asksForConfirmation("¿Cuántas unidades mueven al mes?")).toBe(false);
  });
});
