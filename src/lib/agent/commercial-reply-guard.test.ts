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

describe("real conversation 2026-09-24 16:10 UTC: discovery question wrongly blocked", () => {
  const REAL_DRAFT = "Entiendo; un mejor precio y entrega al día siguiente pesan mucho en la recompra. ¿A qué precio por unidad y para qué cantidad lo está comprando actualmente?";

  it("lets the agent echo the customer's reasons and ask its discovery question", async () => {
    const { commercialReplyViolations } = await import("@/lib/agent/commercial-reply-guard");
    expect(commercialReplyViolations({ reply: REAL_DRAFT, verifiedOffer: null, hasPendingApproval: false, orderCreated: false })).toEqual([]);
  });

  it.each([
    "La entrega al día siguiente también se la podemos dar.",
    "Le confirmo la entrega en 24 horas.",
    "Precio especial:\n- Entrega: al día siguiente",
  ])("still blocks a real delivery commitment without a verified offer: %s", async (reply) => {
    const { commercialReplyViolations } = await import("@/lib/agent/commercial-reply-guard");
    expect(commercialReplyViolations({ reply, verifiedOffer: null, hasPendingApproval: false, orderCreated: false }))
      .toContain("commercial_terms_without_verified_offer");
  });
});

describe("no '0%' discount in customer messages", () => {
  it("removes a zero-discount line from the offer list", async () => {
    const { stripZeroDiscount } = await import("@/lib/agent/commercial-reply-guard");
    const real = "Le puedo ofrecer:\n\n- *Shampoo Professional 1L*: 50 unidades\n- Precio: *$18.50 por unidad*\n- Total: *$925.00*\n- Descuento: 0%\n- Entrega: *al día siguiente*\n- Pago: crédito a *30 días*\n\n¿Le funciona?";
    const cleaned = stripZeroDiscount(real);
    expect(cleaned).not.toMatch(/0%/);
    expect(cleaned).toContain("- Total: *$925.00*\n- Entrega: *al día siguiente*");
    expect(stripZeroDiscount("Quedaría en $18.50 por unidad, con 0% de descuento, entrega en 24 horas.")).toBe("Quedaría en $18.50 por unidad, entrega en 24 horas.");
    expect(stripZeroDiscount("Le puedo rebajar un 5%.")).toBe("Le puedo rebajar un 5%.");
  });

  it("flags any zero discount left in the text", async () => {
    const { commercialReplyViolations } = await import("@/lib/agent/commercial-reply-guard");
    expect(commercialReplyViolations({ reply: "Su descuento es del 0 %.", verifiedOffer: null, hasPendingApproval: false, orderCreated: false }))
      .toContain("zero_discount_mentioned");
  });
});

describe("internal language", () => {
  it.each([
    "Perfecto, puedo igualar esa condición para recuperar su pedido:",
    "Por debajo de $17.75 no puedo, pero sí igualarlo con condiciones verificadas:",
    "La oferta verificada queda así",
  ])("flags %s", async (text) => {
    const { usesInternalLanguage } = await import("@/lib/agent/commercial-reply-guard");
    expect(usesInternalLanguage(text)).toBe(true);
  });

  it("does not flag normal commercial language", async () => {
    const { usesInternalLanguage } = await import("@/lib/agent/commercial-reply-guard");
    expect(usesInternalLanguage("Le puedo mejorar el precio a $17.65 por unidad, con entrega al día siguiente.")).toBe(false);
  });
});

describe("asking permission to quote", () => {
  it("flags the real message and similar ones", async () => {
    const { asksPermissionToQuote } = await import("@/lib/agent/commercial-reply-guard");
    expect(asksPermissionToQuote("Para compararle en esas mismas condiciones, ¿le cotizo las 50 unidades de su último pedido?")).toBe(true);
    expect(asksPermissionToQuote("¿Quiere que le cotice el pedido de siempre?")).toBe(true);
    expect(asksPermissionToQuote("Le puedo igualar ese precio: 50 unidades a $17.75. ¿Se lo preparo?")).toBe(false);
  });
});
