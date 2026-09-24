import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { sqlMock, logAuditMock, sendWhatsAppTemplateMock, sendWhatsAppButtonsMock } = vi.hoisted(() => ({
  sqlMock: vi.fn(),
  logAuditMock: vi.fn(),
  sendWhatsAppTemplateMock: vi.fn(),
  sendWhatsAppButtonsMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ sql: sqlMock }));
vi.mock("@/lib/agent/audit", () => ({ logAudit: logAuditMock }));
vi.mock("@/lib/agent/contact-permission", () => ({ isCustomerSuppressed: vi.fn().mockResolvedValue(false) }));
vi.mock("@/lib/channel/whatsapp-client", () => ({
  isWhatsAppConfigured: () => Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
  sendWhatsAppTemplate: sendWhatsAppTemplateMock,
  sendWhatsAppButtons: sendWhatsAppButtonsMock,
}));
vi.mock("@/lib/db/customer-detail", () => ({ getFrequentProducts: vi.fn() }));
vi.mock("@/lib/tools/customer", () => ({ saveCustomerInsight: vi.fn() }));

import { conversationNeedsTemplate, sendTemplateMessage } from "@/lib/agent/template-outreach";

const target = {
  conversation_id: "conversation-1",
  customer_id: "customer-1",
  customer_name: "Empresa Demo",
  customer_phone: "+50760000000",
  signal_type: "recompra_atrasada",
  days_since: 42,
};

describe("template outreach delivery modes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "test-token");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "phone-id");
    vi.stubEnv("WHATSAPP_TEMPLATE_MODE", "simulate");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("uses the approved copy for every demo opening", async () => {
    await expect(conversationNeedsTemplate("conversation-1")).resolves.toBe(true);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("lets the agent write a demo follow-up while the customer's 24 h window is open", async () => {
    sqlMock.mockResolvedValueOnce([{ recent: true }]);
    await expect(conversationNeedsTemplate("conversation-1", "follow_up")).resolves.toBe(false);
  });

  it("falls back to an approved template for a demo follow-up once the window closed", async () => {
    sqlMock.mockResolvedValueOnce([{ recent: false }]);
    await expect(conversationNeedsTemplate("conversation-1", "follow_up")).resolves.toBe(true);
  });

  it("sends the exact copy with its quick replies and opt-out footer in demo mode", async () => {
    sqlMock
      .mockResolvedValueOnce([target])
      .mockResolvedValueOnce([]);

    await expect(
      sendTemplateMessage("conversation-1", {
        name: "apertura_recompra",
        params: ["Empresa Demo", "50", "Shampoo Professional 1L", "6"],
      }),
    ).resolves.toContain("le escribe Abdiel de Nova Distribution");

    expect(sendWhatsAppTemplateMock).not.toHaveBeenCalled();
    expect(sendWhatsAppButtonsMock).toHaveBeenCalledWith(
      "+50760000000",
      expect.stringContaining("fue de 50 unidades de Shampoo Professional 1L, hace 6 semanas"),
      ["Sí, prepárelo", "Ahora no"],
      "Si no desea más mensajes, responda BAJA.",
    );
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conversation-1",
        payload: { template: "apertura_recompra", deliveryMode: "simulate" },
      }),
    );
  });

  it("lets Meta decide the real window instead of blocking from a stale local timestamp", async () => {
    sqlMock
      .mockResolvedValueOnce([target])
      .mockResolvedValueOnce([]);

    await expect(
      sendTemplateMessage("conversation-1", {
        name: "apertura_recompra",
        params: ["Empresa Demo", "50", "Shampoo Professional 1L", "6"],
      }),
    ).resolves.toContain("le escribe Abdiel de Nova Distribution");

    expect(sendWhatsAppButtonsMock).toHaveBeenCalledOnce();
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: { template: "apertura_recompra", deliveryMode: "simulate" },
      }),
    );
  });
});
