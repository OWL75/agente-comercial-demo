import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { sendWhatsAppMessage } from "@/lib/channel/whatsapp-client";

describe("sendWhatsAppMessage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.WHATSAPP_ACCESS_TOKEN = "test-token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "123456789";
    delete process.env.WHATSAPP_API_VERSION;
  });

  it("uses Graph API v26.0 by default and normalizes the recipient", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: "wamid.test" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendWhatsAppMessage("+507 6000-1234", "Hola")).resolves.toEqual({
      messageId: "wamid.test",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://graph.facebook.com/v26.0/123456789/messages",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: "50760001234",
          type: "text",
          text: { body: "Hola" },
        }),
      }),
    );
  });
});
