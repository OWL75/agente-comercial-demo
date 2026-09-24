import { describe, expect, it } from "vitest";
import {
  creditDays,
  dueDateFor,
  ownerOrderConfirmedText,
  ownerPaymentIssueQuestion,
  paymentReceivedText,
  paymentRequestText,
  type PaymentSummary,
} from "@/lib/payments/payment-messages";

const summary: PaymentSummary = {
  orderShort: "A1B2C3D4", customerName: "Distribuidora Belleza del Istmo", productName: "Shampoo Professional 1L",
  quantity: 50, netUnitPrice: 17.73, discountPct: 4.1622, total: 886.5, deliveryOption: "24 horas", terms: "30 días", dueDate: "2026-10-24",
};

describe("payment step texts", () => {
  it("reads credit terms and computes the due date", () => {
    expect(creditDays("30 días")).toBe(30);
    expect(creditDays("Contado")).toBe(0);
    expect(dueDateFor("30 días", "2026-09-24")).toBe("2026-10-24");
    expect(dueDateFor("contado", "2026-09-24")).toBe("2026-09-24");
  });

  it("tells a credit customer the due date and offers to pay early, in usted", () => {
    const text = paymentRequestText(summary);
    expect(text).toContain("#A1B2C3D4 de $886.50");
    expect(text).toContain("crédito a 30 días, con vencimiento el 24 de octubre de 2026");
    expect(text).not.toMatch(/\b(te|tu|puedes)\b/);
  });

  it("asks a cash customer to pay before dispatch", () => {
    expect(paymentRequestText({ ...summary, terms: "Contado" })).toMatch(/puede pagarlo aquí .* coordinamos el despacho/);
  });

  it("confirms payment to the customer and informs the owner with the facts", () => {
    expect(paymentReceivedText(summary, "Yappy")).toContain("Recibimos su pago de $886.50");
    const owner = ownerOrderConfirmedText(summary);
    expect(owner).toContain("50 × Shampoo Professional 1L a $17.73 c/u (4.16% desc.)");
    expect(owner).toContain("Total $886.50 · entrega 24 horas · 30 días");
    expect(ownerPaymentIssueQuestion(summary, "Prefiero pagar con cheque")).toContain("«Prefiero pagar con cheque»");
  });
});
