import { describe, expect, it } from "vitest";
import { asksForConfirmation, hideStockCount, repeatsOfferList, revealsApproval, commercialReplyViolations, guardedFallback, mentionsSavingsAmount, onlyMatchesReference, presentsFinalVerifiedOffer, soundsPushy } from "./commercial-reply-guard";
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

describe("real conversation 2026-09-25 01:44 UTC: beating the competitor, not matching it", () => {
  const negotiation = {
    customerAskUnitPrice: null, lastOfferedUnitPrice: null, autonomyFloorUnitPrice: 17.58, referenceUnitPrice: 17.75,
    askWithinAutonomy: null, recommendedUnitPrice: 17.65, recommendationBasis: "beat_reference" as const,
  };
  const matched: VerifiedOfferResult = { ...ready, netUnitPrice: 17.75, total: 887.5, discountPct: 4.0541, negotiation };
  const beaten: VerifiedOfferResult = { ...ready, netUnitPrice: 17.65, total: 882.5, discountPct: 4.5946, negotiation };

  it("flags an offer that only matches the competitor while there is margin to beat it", () => {
    expect(onlyMatchesReference("Puedo igualar el precio: 50 unidades a $17.75 por unidad, total $887.50. ¿Me confirma que lo prepare?", matched)).toBe(true);
    expect(onlyMatchesReference("Le ofrezco $17.65 por unidad, total $882.50. ¿Me confirma el pedido?", beaten)).toBe(false);
  });

  it("does not flag the customer's own price accepted as is", () => {
    const asked: VerifiedOfferResult = { ...matched, negotiation: { ...matched.negotiation!, customerAskUnitPrice: 17.75, recommendedUnitPrice: 17.75, recommendationBasis: "ask" } };
    expect(onlyMatchesReference("Perfecto, se lo dejo en $17.75 por unidad, total $887.50. ¿Me confirma el pedido?", asked)).toBe(false);
  });

  it("lets the agent name the competitor price it beats, and no other new figure", () => {
    expect(violations("Le ofrezco $17.65 por unidad en vez de $17.75: total $882.50. ¿Me confirma el pedido?", beaten)).toEqual([]);
    expect(violations("Le ofrezco $17.65 por unidad, total $882.50, con un bono de $9.00. ¿Me confirma el pedido?", beaten)).toContain("offer_money_mismatch");
  });

  it("real conversation 02:0x UTC: '$5.00 menos' is not said — a small saving looks minor", () => {
    expect(mentionsSavingsAmount("Le puedo dejar el Shampoo en $17.65 por unidad, $5.00 menos que su proveedor en 50 unidades.")).toBe(true);
    expect(mentionsSavingsAmount("Con este precio ahorra $5.00 en su pedido.")).toBe(true);
    expect(mentionsSavingsAmount("Le puedo dejar el Shampoo en $17.65 por unidad, por debajo de lo que paga hoy: total $882.50.")).toBe(false);
  });
});

describe("real conversation 2026-09-25 16:57 UTC: \"no es gran diferencia\"", () => {
  const floorOffer: VerifiedOfferResult = {
    ...ready,
    discountPct: 4.973,
    netUnitPrice: 17.58,
    total: 879,
    negotiation: {
      customerAskUnitPrice: 17.58,
      lastOfferedUnitPrice: 17.65,
      autonomyFloorUnitPrice: 17.58,
      referenceUnitPrice: 17.75,
      askWithinAutonomy: true,
      recommendedUnitPrice: 17.58,
      recommendationBasis: "ask",
    },
  };

  it("lets the agent name its own previous offer while improving it", () => {
    expect(violations("Entiendo, de $17.65 se lo puedo dejar en *$17.58 por unidad*, total *$879.00*. ¿Le sirve así?", floorOffer)).toEqual([]);
  });

  it("treats a soft close as the confirmation request of the offer", () => {
    expect(asksForConfirmation("¿Le sirve así?")).toBe(true);
    expect(asksForConfirmation("Si le parece, se lo dejo listo para mañana.")).toBe(true);
    expect(presentsFinalVerifiedOffer("Le ofrezco *$17.58 por unidad*, total *$879.00*. ¿Le sirve así?", floorOffer)).toBe(true);
  });

  it("flags pressure but not a calm close", () => {
    expect(soundsPushy("Le ofrezco $17.65 por unidad. ¿Me confirma el pedido?")).toBe(true);
    expect(soundsPushy("Aproveche este precio solo por hoy.")).toBe(true);
    expect(soundsPushy("Le ofrezco $17.65 por unidad. ¿Le sirve así?")).toBe(false);
  });

  it("falls back in usted, naming the real manager", () => {
    for (const text of [guardedFallback(true), guardedFallback(false, true), guardedFallback(false)]) {
      expect(text).not.toMatch(/\b(déjame|te)\b/i);
      expect(text).not.toMatch(/\bmi gerente\b/i);
    }
  });
});

describe("real conversation 2026-09-25 18:18 UTC: \"mañana en la tarde con mi socio\"", () => {
  const approved: VerifiedOfferResult = { ...ready, netUnitPrice: 17.5, total: 875, discountPct: 5.4054 };
  const LIST = "Ya lo consulté con Abdiel y aprobó el precio de *$17.50 por unidad*. Le dejo la propuesta:\n\n• *50 Shampoo Professional 1L*\n• Precio: *$17.50 por unidad*\n• Total: *$875.00*\n• Stock disponible: 820 unidades\n• Entrega: al día siguiente\n• Crédito: 30 días\n\n¿Se lo dejo listo?";
  const RELIST = "Perfecto, consúltelo mañana por la tarde con su socio. La propuesta queda así:\n\n• *50 Shampoo Professional 1L*\n• *$17.50 por unidad* — total *$875*\n• Entrega al día siguiente\n• Crédito a 30 días\n\nQuedo atento a lo que decidan.";

  it("never tells the customer how much inventory there is", () => {
    expect(hideStockCount(LIST)).toContain("• Stock disponible\n");
    expect(hideStockCount(LIST)).not.toContain("820");
    expect(hideStockCount("Tenemos 820 unidades disponibles para usted.")).toBe("Tenemos stock disponible para usted.");
  });

  it("catches the third copy of the same offer list", () => {
    expect(repeatsOfferList(RELIST, [LIST], approved)).toBe(true);
    expect(repeatsOfferList("Perfecto, le escribo mañana después de las 2.", [LIST], approved)).toBe(false);
    expect(repeatsOfferList(LIST, ["Hola, ¿cómo le ha ido?"], approved)).toBe(false);
  });

  it("does not tell the customer the manager approved it", () => {
    expect(revealsApproval(LIST)).toBe(true);
    expect(revealsApproval("Queda pendiente de aprobación.")).toBe(true);
    expect(revealsApproval("Lo revisé con Abdiel, el gerente, y pude conseguirle $17.50 para este pedido.")).toBe(false);
  });
});

describe("real conversation 2026-09-25 19:31 UTC: competitor already below the floor", () => {
  it("recognizes conditional soft closes as the close of the offer", () => {
    expect(asksForConfirmation("¿Le serviría probarlo así en su próxima reposición?")).toBe(true);
    expect(asksForConfirmation("¿Aun así le funcionaría probar con Nova en esas condiciones?")).toBe(true);
  });

  it("flags asking permission to consult the manager", async () => {
    const { asksPermissionToConsult } = await import("./commercial-reply-guard");
    expect(asksPermissionToConsult("Si para usted es indispensable igualar los $17.50, lo reviso con Abdiel, el gerente. ¿Quiere que lo consulte?")).toBe(true);
    expect(asksPermissionToConsult("Lo reviso con Abdiel, el gerente, y le escribo en unos minutos.")).toBe(false);
  });
});
