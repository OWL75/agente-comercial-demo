/**
 * Customer- and owner-facing texts of the payment step, the due date and
 * the reminder schedule. Customer texts are the payment templates of the
 * catalog, so the demo shows exactly the copy that would be registered in
 * Meta. Pure: the payment service feeds them real order data.
 */
import { renderTemplate, type PaymentTemplateName, type TemplateChoice } from "@/lib/channel/whatsapp-templates";

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

export const money = (value: number) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Days of credit in terms like "30 días"; 0 for cash ("contado") or unknown terms. */
export function creditDays(terms: string): number {
  const match = terms.toLowerCase().match(/(\d+)\s*d[ií]as?/);
  return match ? Number(match[1]) : 0;
}

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function dueDateFor(terms: string, today: string): string {
  return addDays(today, creditDays(terms));
}

export function formatDateEs(isoDate: string): string {
  return new Intl.DateTimeFormat("es-PA", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${isoDate}T00:00:00Z`));
}

type PaymentChoice = TemplateChoice & { name: PaymentTemplateName };

/** The template and parameters for a payment message about this order. */
export function paymentTemplate(name: PaymentTemplateName, p: PaymentSummary): PaymentChoice {
  const due = formatDateEs(p.dueDate);
  switch (name) {
    case "cobro_credito": return { name, params: [p.orderShort, money(p.total), p.terms, due] };
    case "cobro_contado": return { name, params: [p.orderShort, money(p.total)] };
    case "recordatorio_pago": return { name, params: [p.orderShort, money(p.total), due] };
    case "pago_vence_hoy": return { name, params: [p.orderShort, money(p.total)] };
    case "pago_vencido": return { name, params: [p.orderShort, money(p.total), due] };
    case "pago_recibido": return { name, params: [money(p.total), p.orderShort, String(p.quantity), p.productName] };
  }
}

export function paymentRequestTemplate(p: PaymentSummary): PaymentChoice {
  return paymentTemplate(creditDays(p.terms) > 0 ? "cobro_credito" : "cobro_contado", p);
}

export function paymentRequestText(p: PaymentSummary): string {
  const choice = paymentRequestTemplate(p);
  return renderTemplate(choice.name, choice.params);
}

export function paymentReceivedText(p: PaymentSummary): string {
  return renderTemplate("pago_recibido", paymentTemplate("pago_recibido", p).params);
}

export const PAYMENT_BUTTON = "Pagar pedido";

export const PAYMENT_ISSUE_ACK = "Gracias por avisarme. Lo reviso con Abdiel y le escribo en breve para resolverlo.";

// ---------------------------------------------------------------------------
// Due-date reminders
// ---------------------------------------------------------------------------

export type ReminderStep = {
  step: number;
  template: PaymentTemplateName;
  /** Days relative to the due date (negative = before). */
  offsetDays: number;
  title: string;
  productionTiming: string;
  /** Overdue: the owner hears about it on Telegram. */
  notifyOwner: boolean;
};

const CREDIT_REMINDERS: readonly ReminderStep[] = [
  { step: 1, template: "recordatorio_pago", offsetDays: -3, title: "Recordatorio antes del vencimiento", productionTiming: "3 días antes del vencimiento", notifyOwner: false },
  { step: 2, template: "pago_vence_hoy", offsetDays: 0, title: "Vence hoy", productionTiming: "el día del vencimiento", notifyOwner: false },
  { step: 3, template: "pago_vencido", offsetDays: 3, title: "Pago vencido", productionTiming: "3 días después del vencimiento", notifyOwner: true },
];

// A cash order is due when placed and its link was just sent: one reminder
// once it is clearly late, which also tells the owner.
const CASH_REMINDERS: readonly ReminderStep[] = [
  { step: 1, template: "pago_vencido", offsetDays: 2, title: "Pago pendiente", productionTiming: "2 días después del pedido", notifyOwner: true },
];

export function remindersFor(terms: string): readonly ReminderStep[] {
  return creditDays(terms) > 0 ? CREDIT_REMINDERS : CASH_REMINDERS;
}

export function reminderDate(step: ReminderStep, dueDate: string): string {
  return addDays(dueDate, step.offsetDays);
}

/** The next reminder once its date arrived; null when it is not time yet or all were sent. */
export function dueReminder(terms: string, dueDate: string, sentCount: number, today: string): ReminderStep | null {
  const next = remindersFor(terms)[sentCount];
  return next && today >= reminderDate(next, dueDate) ? next : null;
}

// ---------------------------------------------------------------------------
// Owner notifications (Telegram, plain text)
// ---------------------------------------------------------------------------

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

export function ownerPaymentOverdueText(p: PaymentSummary): string {
  return `⚠️ Pago vencido — ${p.customerName}\n${money(p.total)} del pedido #${p.orderShort} venció el ${formatDateEs(p.dueDate)}. Ya le envié un recordatorio con el enlace de pago; si responde que necesita otro plazo, te lo consulto aquí.`;
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
