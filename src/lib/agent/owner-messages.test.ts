import { describe, expect, it } from "vitest";
import {
  approvalButtons,
  callbackData,
  formatApprovalForOwner,
  formatQuestionForOwner,
  parseCallbackData,
  parseOwnerValue,
  samePhone,
} from "@/lib/agent/owner-messages";

const id = "3f2b8c1e-6a4d-4c1b-9e2f-1a2b3c4d5e6f";

describe("owner buttons", () => {
  it("round-trips the action, approval and shown value within Telegram's 64-byte limit", () => {
    const data = callbackData("approve", id, 8);
    expect(Buffer.byteLength(data)).toBeLessThanOrEqual(64);
    expect(parseCallbackData(data)).toEqual({ action: "approve", approvalId: id, value: 8 });
    expect(parseCallbackData(callbackData("reject", id))).toEqual({ action: "reject", approvalId: id, value: null });
  });

  it.each(["", "ap:not-a-uuid", "xx:" + id, `ap:${id}:abc`])("rejects malformed data %s", (data) => {
    expect(parseCallbackData(data)).toBeNull();
  });

  it("labels the approve button with the requested value and offers another value", () => {
    const markup = approvalButtons(id, "discount", 8);
    expect(markup.inline_keyboard[0][0]).toEqual({ text: "✅ Aprobar 8%", callback_data: `ap:${id}:8` });
    expect(markup.inline_keyboard[1][0].callback_data).toBe(`mv:${id}`);
    expect(approvalButtons(id, "other", null).inline_keyboard).toHaveLength(1);
  });
});

describe("owner replies", () => {
  it.each([
    ["7", 7], ["7%", 7], ["dale 6 por ciento", 6], ["48 horas", 48], ["1,500", 1500], ["7,5", 7.5],
  ])("reads %s as %s", (text, value) => expect(parseOwnerValue(text)).toBe(value));

  it("finds no value in plain text", () => expect(parseOwnerValue("sí, dale")).toBeNull());

  it("matches the owner's phone with or without the Panama country code", () => {
    expect(samePhone("+507 6459-7107", "50764597107")).toBe(true);
    expect(samePhone("64597107", "+50764597107")).toBe(true);
    expect(samePhone("+507 6459-7108", "+50764597107")).toBe(false);
    expect(samePhone("", "+50764597107")).toBe(false);
  });
});

describe("what the owner reads", () => {
  it("summarizes a discount request with verified money, limits and the customer's words", () => {
    const text = formatApprovalForOwner({
      customerName: "Distribuidora Belleza del Istmo",
      type: "discount",
      requestedValue: { pct: 8, quantity: 200, productSku: "CAP-001" },
      context: { productName: "Shampoo Professional 1L", unitPrice: 18.5, stockAvailable: 820, creditAvailable: 12000, autonomyMaxPct: 5, reason: "Volumen alto" },
      policyMax: 10,
      agentRecommendation: "Aprobar 8%, recupera un cliente que se fue por precio",
      creditTerms: "30 días",
      lastCustomerMessage: "Te compro 200 si me das 8%",
    });
    expect(text).toContain("Pide: 8% de descuento en 200 × Shampoo Professional 1L");
    expect(text).toContain("$18.50 → $17.02 c/u · total $3,404.00 (sin descuento $3,700.00)");
    expect(text).toContain("Yo puedo dar hasta 5% · con tu OK hasta 10%");
    expect(text).toContain("crédito disponible $12,000.00 (30 días)");
    expect(text).toContain("«Te compro 200 si me das 8%»");
    expect(text).not.toMatch(/[*_`]/);
  });

  it("asks a free question the owner answers by replying", () => {
    const text = formatQuestionForOwner({ customerName: "Cliente", question: "¿Le damos 24 h?", lastCustomerMessage: null });
    expect(text).toContain("¿Le damos 24 h?");
    expect(text).toContain("Responde a este mensaje");
  });
});
