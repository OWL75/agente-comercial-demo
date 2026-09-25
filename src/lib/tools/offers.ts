import "server-only";
import { z } from "zod";
import { sql } from "@/lib/db";
import { getActivePolicy } from "@/lib/db/policies";
import { evaluateDelivery, evaluateDiscount } from "@/lib/policy/evaluate";
import {
  autonomyFloorUnitPrice,
  quoteByNetPrice,
  quoteMoney,
  nextConcession,
  smallestNaturalDiscount,
} from "@/lib/policy/verified-offer";
import { uuidLike } from "@/lib/zod-helpers";

export const prepareVerifiedOfferInput = z.object({
  conversationId: uuidLike,
  customerId: uuidLike,
  sku: z.string().trim().min(1),
  quantity: z.number().int().positive(),
  discountPct: z.number().int().min(0).max(100).optional()
    .describe("Porcentaje entero (0 = precio de lista). Úsalo para el precio de lista o para un descuento que requiere aprobación."),
  netUnitPrice: z.number().positive().optional()
    .describe("Precio neto por unidad con máximo dos decimales, para negociar al centavo (por ejemplo 17.73). Usa discountPct o netUnitPrice, no ambos."),
  customerAskUnitPrice: z.number().positive().optional()
    .describe("Precio por unidad que el cliente pidió explícitamente (\"déjemelo a 17.70\"). No pases aquí el precio de su proveedor: esa es una referencia, no un piso."),
  deliveryHours: z.number().int().positive(),
}).superRefine((input, ctx) => {
  if ((input.discountPct == null) === (input.netUnitPrice == null)) {
    ctx.addIssue({ code: "custom", message: "Indica discountPct o netUnitPrice (exactamente uno)." });
  }
});
export type PrepareVerifiedOfferInput = z.infer<typeof prepareVerifiedOfferInput>;

type Approval = {
  type: string;
  status: string;
  requested_value: { productSku?: string; quantity?: number };
  decided_value: { pct?: number; amount?: number; hours?: number } | null;
  context: { unitPrice?: number; policyVersion?: number };
};

export type VerifiedOfferResult = {
  status: "ready" | "approval_required" | "unavailable";
  sku: string;
  productName: string;
  quantity: number;
  listUnitPrice: number;
  discountPct: number;
  netUnitPrice: number;
  subtotal: number;
  total: number;
  stockAvailable: number;
  creditAvailable: number;
  creditTerms: string;
  deliveryHours: number;
  deliveryEligible: boolean;
  policyVersion: number;
  approvalsNeeded: Array<"discount" | "credit" | "delivery">;
  reason?: string;
  recommendedDiscountPct?: number;
  recommendedNetUnitPrice?: number;
  /** Facts for the next move in a price negotiation. */
  negotiation?: {
    customerAskUnitPrice: number | null;
    lastOfferedUnitPrice: number | null;
    autonomyFloorUnitPrice: number;
    /** Competitor price or target the customer mentioned (precio_objetivo). Informational. */
    referenceUnitPrice: number | null;
    /** The explicit ask is within the agent's margin: accept it as is. */
    askWithinAutonomy: boolean | null;
    /** The next price to offer (see nextConcession). */
    recommendedUnitPrice: number | null;
    recommendationBasis: "ask" | "beat_reference" | "step" | "floor" | "at_floor";
  };
  roundingRule: "round_net_unit_to_cent_then_multiply";
};

function exactApproval(
  approvals: Approval[],
  type: string,
  sku: string,
  quantity: number,
  unitPrice: number,
  policyVersion: number,
): Approval | undefined {
  return approvals.find((approval) =>
    approval.type === type &&
    approval.requested_value?.productSku === sku &&
    approval.requested_value?.quantity === quantity &&
    Number(approval.context?.unitPrice) === unitPrice &&
    Number(approval.context?.policyVersion) === policyVersion
  );
}

export async function prepareVerifiedOffer(rawInput: PrepareVerifiedOfferInput): Promise<VerifiedOfferResult> {
  const input = prepareVerifiedOfferInput.parse(rawInput);
  const policy = await getActivePolicy();
  if (!policy) throw new Error("No hay una política comercial activa configurada.");

  const [conversation] = await sql<Array<{
    ended_at: string | null;
    payment_terms: string;
    credit_available: string;
  }>>`
    select conv.ended_at, c.payment_terms, c.credit_available
    from agente_comercial.conversations conv
    join agente_comercial.customers c on c.id = conv.customer_id
    where conv.id = ${input.conversationId} and conv.customer_id = ${input.customerId}
  `;
  if (!conversation || conversation.ended_at) throw new Error("Conversación no disponible.");

  const [product] = await sql<Array<{
    sku: string; name: string; unit_price: string; stock: number; express_eligible: boolean;
  }>>`
    select sku, name, unit_price, stock, express_eligible
    from agente_comercial.products where sku = ${input.sku}
  `;
  if (!product) throw new Error(`Producto con SKU "${input.sku}" no encontrado.`);

  const unitPrice = Number(product.unit_price);
  const byPrice = input.netUnitPrice != null;
  const priced = byPrice
    ? quoteByNetPrice(unitPrice, input.quantity, input.netUnitPrice!)
    : { ...quoteMoney(unitPrice, input.quantity, input.discountPct!), discountPct: input.discountPct! };
  const { discountPct, ...money } = priced;
  const [insight] = await sql<Array<{ precio_objetivo: string | null }>>`
    select precio_objetivo from agente_comercial.customer_insights
    where conversation_id = ${input.conversationId}
  `;
  // Only an explicit ask is a floor ("déjemelo a 17.70"). The competitor's
  // price the customer mentioned is a reference: blocking every price below
  // it left the agent saying "no puedo mejorarlo" with margin to spare.
  const target = input.customerAskUnitPrice ?? null;
  const reference = insight?.precio_objetivo == null ? null : Number(insight.precio_objetivo);
  const floor = autonomyFloorUnitPrice(unitPrice, policy.config.discount.autoMaxPct);
  const [lastPresented] = await sql<Array<{ net: string | null }>>`
    select payload->'offer'->>'netUnitPrice' as net from agente_comercial.audit_log
    where conversation_id = ${input.conversationId} and category = 'policy_check'
      and label = 'Oferta verificada presentada para confirmación'
    order by created_at desc limit 1
  `;
  const lastOffered = lastPresented?.net == null ? null : Number(lastPresented.net);
  // Before any offer, a whole-percent discount must not overshoot what already
  // reaches the reference price. Once an offer is on the table and the
  // customer asks for more, conceding is the negotiation itself.
  const recommended = reference == null || byPrice || lastOffered != null
    ? null
    : smallestNaturalDiscount(unitPrice, reference, policy.config.discount.autoMaxPct);
  const concession = nextConcession({ listUnitPrice: unitPrice, lastOffered, ask: target, floor, reference });
  const negotiation: NonNullable<VerifiedOfferResult["negotiation"]> = {
    customerAskUnitPrice: target,
    referenceUnitPrice: reference,
    lastOfferedUnitPrice: lastOffered,
    autonomyFloorUnitPrice: floor,
    askWithinAutonomy: target == null ? null : concession.withinAutonomy,
    recommendedUnitPrice: concession.unitPrice,
    recommendationBasis: concession.basis,
  };

  const base: Omit<VerifiedOfferResult, "status" | "approvalsNeeded"> = {
    sku: product.sku,
    productName: product.name,
    quantity: input.quantity,
    ...money,
    discountPct,
    negotiation,
    stockAvailable: Number(product.stock),
    creditAvailable: Number(conversation.credit_available),
    creditTerms: conversation.payment_terms,
    deliveryHours: input.deliveryHours,
    deliveryEligible: product.express_eligible === true,
    policyVersion: policy.version,
    roundingRule: "round_net_unit_to_cent_then_multiply",
  };

  if (Number(product.stock) < input.quantity) {
    return { ...base, status: "unavailable", approvalsNeeded: [], reason: "stock_insufficient" };
  }
  // Never below what the customer asked: every cent under the ask is margin given away.
  if (target != null && money.netUnitPrice < target - 0.005) {
    return {
      ...base,
      status: "unavailable",
      approvalsNeeded: [],
      reason: "below_customer_ask",
      recommendedNetUnitPrice: Math.max(target, floor),
    };
  }
  if (recommended !== null && discountPct > recommended) {
    return {
      ...base,
      status: "unavailable",
      approvalsNeeded: [],
      reason: "smaller_natural_discount_reaches_target",
      recommendedDiscountPct: recommended,
    };
  }

  const discountDecision = evaluateDiscount(discountPct, policy.config.discount);
  if (discountDecision.decision === "denied") {
    return { ...base, status: "unavailable", approvalsNeeded: [], reason: "discount_out_of_policy" };
  }

  const approvals = await sql<Approval[]>`
    select distinct on (type) type, status, requested_value, decided_value, context
    from agente_comercial.approvals
    where conversation_id = ${input.conversationId} and customer_id = ${input.customerId}
    order by type, created_at desc, id desc
  `;
  const approvalsNeeded: VerifiedOfferResult["approvalsNeeded"] = [];

  const discountApproval = exactApproval(
    approvals, "discount", product.sku, input.quantity, unitPrice, policy.version,
  );
  if (
    discountDecision.decision === "requires_approval" &&
    !(["approved", "modified"].includes(discountApproval?.status ?? "") &&
      discountApproval?.decided_value?.pct === discountPct)
  ) approvalsNeeded.push("discount");

  const deliveryDecision = evaluateDelivery(
    input.deliveryHours, product.express_eligible === true, policy.config.delivery,
  );
  const deliveryApproval = exactApproval(
    approvals, "delivery", product.sku, input.quantity, unitPrice, policy.version,
  );
  const deliveryApproved = ["approved", "modified"].includes(deliveryApproval?.status ?? "") &&
    deliveryApproval?.decided_value?.hours === input.deliveryHours;
  // An existing pending decision remains authoritative even if another loose
  // lookup would classify the product as eligible. This prevents presenting
  // a condition as final while a human card for the same deal is open.
  if (deliveryApproval?.status === "pending" ||
      (deliveryDecision.decision === "requires_approval" && !deliveryApproved)) {
    approvalsNeeded.push("delivery");
  }

  if (!Number.isFinite(base.creditAvailable) || base.creditAvailable < money.total) {
    const creditApproval = exactApproval(
      approvals, "credit", product.sku, input.quantity, unitPrice, policy.version,
    );
    const extra = Number(creditApproval?.decided_value?.amount ?? 0);
    if (!(["approved", "modified"].includes(creditApproval?.status ?? "") &&
      Number.isFinite(extra) && base.creditAvailable + extra >= money.total)) {
      approvalsNeeded.push("credit");
    }
  }

  // A price below the floor is the owner's call; the agent answers with its
  // best price first and only files this if the customer insists.
  const belowFloor = approvalsNeeded.includes("discount") && money.netUnitPrice < floor - 0.005;
  return {
    ...base,
    status: approvalsNeeded.length ? "approval_required" : "ready",
    approvalsNeeded: [...new Set(approvalsNeeded)],
    ...(belowFloor ? { reason: "below_autonomy_floor", recommendedNetUnitPrice: floor } : {}),
  };
}

