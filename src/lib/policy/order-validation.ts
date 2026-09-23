import type { CommercialPolicyConfig } from "@/lib/db/policies";
import { evaluateDelivery, evaluateDiscount } from "@/lib/policy/evaluate";
import { quoteMoney } from "@/lib/policy/verified-offer";

export type OrderLine = { sku: string; quantity: number; unitPrice: number; expressEligible: boolean };
export type ScopedApproval = {
  type: string; status: string; requested_value: { productSku?: string; quantity?: number };
  decided_value: { pct?: number; amount?: number; hours?: number } | null;
  context: { unitPrice?: number; policyVersion?: number };
};

export function aggregateItems(items: { sku: string; quantity: number }[]) {
  const quantities = new Map<string, number>();
  for (const item of items) {
    const quantity = (quantities.get(item.sku) ?? 0) + item.quantity;
    if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new Error("Cantidad inválida.");
    quantities.set(item.sku, quantity);
  }
  return [...quantities].sort(([a], [b]) => a.localeCompare(b)).map(([sku, quantity]) => ({ sku, quantity }));
}

export function moneyTotals(lines: OrderLine[], discountPct: number) {
  let subtotal = 0;
  let total = 0;
  for (const line of lines) {
    const money = quoteMoney(line.unitPrice, line.quantity, discountPct);
    subtotal += money.subtotal;
    total += money.total;
  }
  return { subtotal, total };
}

export function validateOrderConditions(args: {
  lines: OrderLine[]; discountPct: number; creditTerms: string; deliveryHours: number;
  total: number; customer: { paymentTerms: string; creditAvailable: number };
  policy: { version: number; config: CommercialPolicyConfig }; approvals: ScopedApproval[];
}) {
  const { lines, policy, customer } = args;
  if (args.approvals.some((approval) => approval.status === "pending")) {
    throw new Error("No se puede crear el pedido mientras exista una aprobación pendiente.");
  }
  // Existing approvals scope one SKU. Multi-line exceptions await versioned quotes.
  const approved = (type: string) => args.approvals.find((a) =>
    a.type === type && ["approved", "modified"].includes(a.status) && lines.length === 1 &&
    a.requested_value?.productSku === lines[0].sku && a.requested_value?.quantity === lines[0].quantity &&
    a.context?.unitPrice === lines[0].unitPrice && a.context?.policyVersion === policy.version,
  );
  const discount = evaluateDiscount(args.discountPct, policy.config.discount);
  if (discount.decision === "denied") throw new Error("Descuento fuera de política.");
  if (discount.decision === "requires_approval" && approved("discount")?.decided_value?.pct !== args.discountPct) {
    throw new Error("Se requiere aprobación vigente para este producto, cantidad, precio y descuento exactos.");
  }
  if (args.creditTerms !== customer.paymentTerms) {
    throw new Error("El plazo solicitado no coincide con la condición vigente. Cambiar plazos aún no está soportado.");
  }
  if (!Number.isFinite(customer.creditAvailable) || customer.creditAvailable < 0) throw new Error("Crédito inválido.");
  const credit = approved("credit")?.decided_value?.amount;
  const extra = typeof credit === "number" && Number.isFinite(credit) && credit > 0 ? credit : 0;
  if (args.total > customer.creditAvailable + extra || (!policy.config.credit.existingConditionAuto && !extra)) {
    throw new Error("Crédito insuficiente o condición sin aprobación para este pedido.");
  }
  if (!Number.isSafeInteger(args.deliveryHours) || args.deliveryHours <= 0) throw new Error("Entrega inválida.");
  const standard = args.deliveryHours === policy.config.delivery.standardHours;
  const express = args.deliveryHours === policy.config.delivery.expressHours && lines.every((l) =>
    evaluateDelivery(args.deliveryHours, l.expressEligible, policy.config.delivery).decision === "auto_approve",
  );
  if (!standard && !express && approved("delivery")?.decided_value?.hours !== args.deliveryHours) {
    throw new Error("La entrega requiere una aprobación específica para este pedido.");
  }
}
