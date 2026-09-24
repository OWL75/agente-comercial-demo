/**
 * Customer- and owner-facing texts of the payment step, and the due date.
 * Pure: the payment service feeds them real order data.
 */

export type PaymentSummary = {
  orderShort: string;
  customerName: string;
  productName: string;
  quantity: number;
  netUnitPrice: number;
  discountPct: number;
  total: number;
  deliveryOption: string;
  terms: string;
  dueDate: string;
};

const money = (value: number) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Days of credit in terms like "30 días"; 0 for cash ("contado") or unknown terms. */
export function creditDays(terms: string): number {
  const match = terms.toLowerCase().match(/(\d+)\s*d[ií]as?/);
  return match ? Number(match[1]) : 0;
}

export function dueDateFor(terms: string, today: string): string {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + creditDays(terms));
  return date.toISOString().slice(0, 10);
}

export function formatDateEs(isoDate: string): string {
  return new Intl.DateTimeFormat("es-PA", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${isoDate}T00:00:00Z`));
}

export function paymentRequestText(p: PaymentSummary): string {
  return creditDays(p.terms) > 0
    ? `Su pedido #${p.orderShort} de ${money(p.total)} quedó registrado con crédito a ${p.terms}, con vencimiento el ${formatDateEs(p.dueDate)}. Le dejo el enlace para pagarlo cuando le convenga, con tarjeta, Yappy o transferencia.`
    : `Para completar su pedido #${p.orderShort} de ${money(p.total)}, puede pagarlo aquí con tarjeta, Yappy o transferencia. En cuanto se acredite el pago coordinamos el despacho.`;
}

export const PAYMENT_BUTTON = "Pagar pedido";
export const PAYMENT_FOOTER = "Si necesita pagar de otra forma, respóndame aquí.";

export function paymentReceivedText(p: PaymentSummary, methodLabel: string): string {
  return `Recibimos su pago de ${money(p.total)} del pedido #${p.orderShort} (${methodLabel}). ¡Muchas gracias! Coordinamos la entrega de ${p.quantity} unidades de ${p.productName}.`;
}

export const PAYMENT_ISSUE_ACK = "Gracias por avisarme. Lo reviso con Abdiel y le escribo en breve para resolverlo.";

export function ownerOrderConfirmedText(p: PaymentSummary): string {
  const price = p.discountPct > 0
    ? `${money(p.netUnitPrice)} c/u (${Number(p.discountPct.toFixed(2))}% desc.)`
    : `${money(p.netUnitPrice)} c/u`;
  return [
    `🧾 Pedido confirmado — ${p.customerName}`,
    `${p.quantity} × ${p.productName} a ${price}`,
    `Total ${money(p.total)} · entrega ${p.deliveryOption} · ${p.terms} (vence ${formatDateEs(p.dueDate)})`,
    `Ya le envié el enlace de pago. Te aviso cuando pague.`,
  ].join("\n");
}

export function ownerPaymentReceivedText(p: PaymentSummary, methodLabel: string): string {
  return `💰 Pago recibido — ${p.customerName}\n${money(p.total)} del pedido #${p.orderShort} (${methodLabel}).`;
}

export function ownerPaymentIssueQuestion(p: PaymentSummary, issue: string): string {
  return `${p.customerName} tiene un tema con el pago del pedido #${p.orderShort} (${money(p.total)}, ${p.terms}): «${issue}». ¿Cómo quieres resolverlo?`;
}

export const PAYMENT_METHODS = {
  tarjeta: "tarjeta",
  yappy: "Yappy",
  transferencia: "transferencia ACH",
} as const;
export type PaymentMethod = keyof typeof PAYMENT_METHODS;
