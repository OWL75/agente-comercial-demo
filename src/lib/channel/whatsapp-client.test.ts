import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
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
      sendWhatsAppTemplate("+507 6601-3325", "seguimiento_valor", "es", ["Empresa Demo", "Shampoo"]),
    ).resolves.toEqual({ messageId: "wamid.tpl" });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({
      messaging_product: "whatsapp",
      to: "50766013325",
      type: "template",
      template: {
        name: "seguimiento_valor",
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

describe("sendWhatsAppButtons", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.WHATSAPP_ACCESS_TOKEN = "test-token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "123456789";
    delete process.env.WHATSAPP_API_VERSION;
  });

  it("sends a template's quick replies as reply buttons with its footer", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: "wamid.buttons" }] }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { sendWhatsAppButtons } = await import("@/lib/channel/whatsapp-client");

    await sendWhatsAppButtons("+507 6000-1234", "¿Le preparo la misma cantidad?", ["Sí, prepárelo", "Ahora no"], "Si no desea más mensajes, responda BAJA.");

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      messaging_product: "whatsapp",
      to: "50760001234",
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: "¿Le preparo la misma cantidad?" },
        footer: { text: "Si no desea más mensajes, responda BAJA." },
        action: {
          buttons: [
            { type: "reply", reply: { id: "qr_1", title: "Sí, prepárelo" } },
            { type: "reply", reply: { id: "qr_2", title: "Ahora no" } },
          ],
        },
      },
    });
  });
});
