import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { sqlMock, logAuditMock, sendWhatsAppTemplateMock, sendWhatsAppInteractiveButtonsMock } = vi.hoisted(() => ({
  sqlMock: vi.fn(),
  logAuditMock: vi.fn(),
  sendWhatsAppTemplateMock: vi.fn(),
  sendWhatsAppInteractiveButtonsMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ sql: sqlMock }));
vi.mock("@/lib/agent/audit", () => ({ logAudit: logAuditMock }));
vi.mock("@/lib/agent/contact-permission", () => ({ isCustomerSuppressed: vi.fn().mockResolvedValue(false) }));
vi.mock("@/lib/channel/whatsapp-client", () => ({
  isWhatsAppConfigured: () => Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
  sendWhatsAppTemplate: sendWhatsAppTemplateMock,
  sendWhatsAppInteractiveButtons: sendWhatsAppInteractiveButtonsMock,
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

  it("uses the template strategy for every demo opening and follow-up", async () => {
    await expect(conversationNeedsTemplate("conversation-1")).resolves.toBe(true);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("sends the exact copy with interactive buttons when the demo phone opened the service window", async () => {
    sqlMock
      .mockResolvedValueOnce([target])
      .mockResolvedValueOnce([]);

    await expect(
      sendTemplateMessage("conversation-1", {
        name: "apertura_recompra",
        params: ["Empresa Demo", "42", "Shampoo Professional 1L"],
      }),
    ).resolves.toContain("Hola Empresa Demo");

    expect(sendWhatsAppTemplateMock).not.toHaveBeenCalled();
    expect(sendWhatsAppInteractiveButtonsMock).toHaveBeenCalledWith(
      "+50760000000",
      expect.stringContaining("42 días"),
      [
        { id: "demo_apertura_recompra_1", title: "Sí, prepárala" },
        { id: "demo_apertura_recompra_2", title: "Ahora no" },
        { id: "demo_apertura_recompra_3", title: "No me interesa" },
      ],
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
        params: ["Empresa Demo", "42", "Shampoo Professional 1L"],
      }),
    ).resolves.toContain("Hola Empresa Demo");

    expect(sendWhatsAppInteractiveButtonsMock).toHaveBeenCalledOnce();
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: { template: "apertura_recompra", deliveryMode: "simulate" },
      }),
    );
  });
});
