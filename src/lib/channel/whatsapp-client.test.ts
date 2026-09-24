import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  sendWhatsAppInteractiveButtons,
  sendWhatsAppMessage,
  sendWhatsAppTemplate,
} from "@/lib/channel/whatsapp-client";

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

describe("sendWhatsAppTemplate", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.WHATSAPP_ACCESS_TOKEN = "test-token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "123456789";
    delete process.env.WHATSAPP_API_VERSION;
  });

  it("sends the template name, language and body parameters in Meta's format", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: "wamid.tpl" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendWhatsAppTemplate("+507 6601-3325", "seguimiento_recordatorio", "es", ["Empresa Demo", "Shampoo"]),
    ).resolves.toEqual({ messageId: "wamid.tpl" });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({
      messaging_product: "whatsapp",
      to: "50766013325",
      type: "template",
      template: {
        name: "seguimiento_recordatorio",
        language: { code: "es" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: "Empresa Demo" },
              { type: "text", text: "Shampoo" },
            ],
          },
        ],
      },
    });
  });

  it("throws with Meta's error when the template is not approved", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response('{"error":{"code":132001}}', { status: 404 })),
    );
    await expect(sendWhatsAppTemplate("50766013325", "no_existe", "es", [])).rejects.toThrow("132001");
  });
});

describe("sendWhatsAppInteractiveButtons", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.WHATSAPP_ACCESS_TOKEN = "test-token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "123456789";
  });

  it("sends the simulated template body with reply buttons", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: "wamid.interactive" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await sendWhatsAppInteractiveButtons("+507 6601-3325", "Hola Empresa Demo", [
      { id: "demo_apertura_1", title: "Sí, prepárala" },
      { id: "demo_apertura_2", title: "Ahora no" },
    ]);

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "50766013325",
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: "Hola Empresa Demo" },
        action: {
          buttons: [
            { type: "reply", reply: { id: "demo_apertura_1", title: "Sí, prepárala" } },
            { type: "reply", reply: { id: "demo_apertura_2", title: "Ahora no" } },
          ],
        },
      },
    });
  });

  it("rejects an invalid button count before calling Meta", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(sendWhatsAppInteractiveButtons("50766013325", "Hola", [])).rejects.toThrow("entre 1 y 3");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
