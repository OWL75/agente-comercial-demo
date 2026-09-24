import { describe, expect, it } from "vitest";
import {
  creditDays,
  dueDateFor,
  dueReminder,
  ownerOrderConfirmedText,
  ownerPaymentIssueQuestion,
  ownerPaymentOverdueText,
  paymentReceivedText,
  paymentRequestText,
  paymentTemplate,
  reminderDate,
  remindersFor,
  type PaymentSummary,
} from "@/lib/payments/payment-messages";
import { renderTemplate } from "@/lib/channel/whatsapp-templates";

const summary: PaymentSummary = {
  orderShort: "A1B2C3D4", customerName: "Distribuidora Belleza del Istmo", productName: "Shampoo Professional 1L",
  quantity: 50, netUnitPrice: 17.7, discountPct: 4.3243, total: 885, deliveryOption: "24 horas", terms: "30 días", dueDate: "2026-10-24",
};

describe("payment step texts", () => {
  it("reads credit terms and computes the due date", () => {
    expect(creditDays("30 días")).toBe(30);
    expect(creditDays("Contado")).toBe(0);
    expect(dueDateFor("30 días", "2026-09-24")).toBe("2026-10-24");
    expect(dueDateFor("contado", "2026-09-24")).toBe("2026-09-24");
  });

  it("uses the credit payment template: due date and an early-payment option, in usted", () => {
    expect(paymentRequestText(summary)).toBe(
      "Su pedido #A1B2C3D4 de $885.00 quedó registrado con crédito a 30 días, con vencimiento el 24 de octubre de 2026. Puede pagarlo aquí cuando le convenga, con tarjeta, Yappy o transferencia.",
    );
  });

  it("uses the cash template when there is no credit", () => {
    expect(paymentRequestText({ ...summary, terms: "Contado" })).toMatch(/puede pagarlo aquí .* coordinamos el despacho/);
  });

  it("confirms payment to the customer and informs the owner with the facts", () => {
    expect(paymentReceivedText(summary)).toBe(
      "Recibimos su pago de $885.00 del pedido #A1B2C3D4. ¡Muchas gracias! Coordinamos la entrega de 50 unidades de Shampoo Professional 1L.",
    );
    const owner = ownerOrderConfirmedText(summary);
    expect(owner).toContain("50 × Shampoo Professional 1L a $17.70 c/u (4.32% desc.)");
    expect(owner).toContain("Total $885.00 · entrega 24 horas · 30 días");
    expect(ownerPaymentIssueQuestion(summary, "Prefiero pagar con cheque")).toContain("«Prefiero pagar con cheque»");
    expect(ownerPaymentOverdueText(summary)).toContain("⚠️ Pago vencido — Distribuidora Belleza del Istmo");
  });
});

describe("due-date reminders", () => {
  it("reminds a credit customer 3 days before, on the due date and 3 days after; only the last alerts the owner", () => {
    const steps = remindersFor("30 días");
    expect(steps.map((s) => [s.template, reminderDate(s, "2026-10-24"), s.notifyOwner])).toEqual([
      ["recordatorio_pago", "2026-10-21", false],
      ["pago_vence_hoy", "2026-10-24", false],
      ["pago_vencido", "2026-10-27", true],
    ]);
  });

  it("sends each reminder only once its date arrives, in order", () => {
    expect(dueReminder("30 días", "2026-10-24", 0, "2026-10-20")).toBeNull();
    expect(dueReminder("30 días", "2026-10-24", 0, "2026-10-21")?.template).toBe("recordatorio_pago");
    expect(dueReminder("30 días", "2026-10-24", 1, "2026-10-23")).toBeNull();
    expect(dueReminder("30 días", "2026-10-24", 1, "2026-10-24")?.template).toBe("pago_vence_hoy");
    expect(dueReminder("30 días", "2026-10-24", 2, "2026-11-30")?.template).toBe("pago_vencido");
    expect(dueReminder("30 días", "2026-10-24", 3, "2026-11-30")).toBeNull();
  });

  it("a cash order gets one late-payment reminder two days after the order", () => {
    expect(remindersFor("Contado").map((s) => [s.template, s.offsetDays])).toEqual([["pago_vencido", 2]]);
  });

  it("renders every reminder from its catalog template", () => {
    const upcoming = paymentTemplate("recordatorio_pago", summary);
    expect(renderTemplate(upcoming.name, upcoming.params)).toBe(
      "Hola, le recordamos que el pago de su pedido #A1B2C3D4 por $885.00 vence el 24 de octubre de 2026. Puede pagarlo aquí cuando le convenga. Si ya lo realizó, puede ignorar este mensaje.",
    );
    const overdue = paymentTemplate("pago_vencido", summary);
    expect(renderTemplate(overdue.name, overdue.params)).toContain("venció el 24 de octubre de 2026");
  });
});
