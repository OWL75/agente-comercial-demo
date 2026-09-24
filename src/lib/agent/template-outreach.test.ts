import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { sqlMock, logAuditMock, sendWhatsAppTemplateMock } = vi.hoisted(() => ({
  sqlMock: vi.fn(),
  logAuditMock: vi.fn(),
  sendWhatsAppTemplateMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ sql: sqlMock }));
vi.mock("@/lib/agent/audit", () => ({ logAudit: logAuditMock }));
vi.mock("@/lib/agent/contact-permission", () => ({ isCustomerSuppressed: vi.fn().mockResolvedValue(false) }));
vi.mock("@/lib/channel/whatsapp-client", () => ({
  isWhatsAppConfigured: () => Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
  sendWhatsAppTemplate: sendWhatsAppTemplateMock,
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

describe("template outreach safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "test-token");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "phone-id");
    vi.stubEnv("WHATSAPP_TEMPLATES_ENABLED", "false");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("requires a template outside the 24 h window even while the feature switch is off", async () => {
    sqlMock.mockResolvedValueOnce([target]).mockResolvedValueOnce([{ open: false }]);

    await expect(conversationNeedsTemplate("conversation-1")).resolves.toBe(true);
  });

  it("fails closed instead of falling back to free text when templates are not enabled", async () => {
    sqlMock.mockResolvedValueOnce([target]);

    await expect(
      sendTemplateMessage("conversation-1", {
        name: "apertura_recompra",
        params: ["Empresa Demo", "42", "Shampoo Professional 1L"],
      }),
    ).resolves.toBe("");

    expect(sendWhatsAppTemplateMock).not.toHaveBeenCalled();
    expect(sqlMock).toHaveBeenCalledTimes(1);
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conversation-1",
        payload: { template: "apertura_recompra", blocked: true },
      }),
    );
  });
});
