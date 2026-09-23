import "server-only";
import { z } from "zod";
import { sql } from "@/lib/db";
import { getActivePolicy } from "@/lib/db/policies";
import { evaluateDelivery, evaluateDiscount } from "@/lib/policy/evaluate";
import { quoteMoney, smallestNaturalDiscount } from "@/lib/policy/verified-offer";
import { uuidLike } from "@/lib/zod-helpers";

export const prepareVerifiedOfferInput = z.object({
  conversationId: uuidLike,
  customerId: uuidLike,
  sku: z.string().trim().min(1),
  quantity: z.number().int().positive(),
  discountPct: z.number().int().min(0).max(100)
    .describe("Porcentaje comercial natural y entero (por ejemplo 2, 3, 4 o 5)."),
  deliveryHours: z.number().int().positive(),
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
  const money = quoteMoney(unitPrice, input.quantity, input.discountPct);
  const [insight] = await sql<Array<{ precio_objetivo: string | null }>>`
    select precio_objetivo from agente_comercial.customer_insights
    where conversation_id = ${input.conversationId}
  `;
  const target = insight?.precio_objetivo == null ? null : Number(insight.precio_objetivo);
  const recommended = target == null
    ? null
    : smallestNaturalDiscount(unitPrice, target, policy.config.discount.autoMaxPct);

  const base: Omit<VerifiedOfferResult, "status" | "approvalsNeeded"> = {
    sku: product.sku,
    productName: product.name,
    quantity: input.quantity,
    ...money,
    discountPct: input.discountPct,
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
  if (recommended !== null && input.discountPct > recommended) {
    return {
      ...base,
      status: "unavailable",
      approvalsNeeded: [],
      reason: "smaller_natural_discount_reaches_target",
      recommendedDiscountPct: recommended,
    };
  }

  const discountDecision = evaluateDiscount(input.discountPct, policy.config.discount);
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
      discountApproval?.decided_value?.pct === input.discountPct)
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

  return {
    ...base,
    status: approvalsNeeded.length ? "approval_required" : "ready",
    approvalsNeeded: [...new Set(approvalsNeeded)],
  };
}

