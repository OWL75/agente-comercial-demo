import { describe, expect, it } from "vitest";
import { splitWhatsAppBold, toWhatsAppText } from "@/lib/channel/whatsapp-format";

describe("toWhatsAppText", () => {
  it("turns Markdown double-asterisk bold into WhatsApp single-asterisk bold", () => {
    expect(toWhatsAppText("Lo tenemos a **$18.50 por unidad**.")).toBe("Lo tenemos a *$18.50 por unidad*.");
  });

  it("leaves WhatsApp-native bold untouched", () => {
    expect(toWhatsAppText("Precio: *$18.50*")).toBe("Precio: *$18.50*");
  });

  it("converts several bold spans, italics, strikethrough, headings and links", () => {
    expect(toWhatsAppText("**A** y **B**")).toBe("*A* y *B*");
    expect(toWhatsAppText("__nota__ ~~viejo~~")).toBe("_nota_ ~viejo~");
    expect(toWhatsAppText("## Oferta\nDetalle")).toBe("*Oferta*\nDetalle");
    expect(toWhatsAppText("[catálogo](https://example.com/c)")).toBe("catálogo: https://example.com/c");
  });

  it("keeps plain list dashes and line breaks", () => {
    expect(toWhatsAppText("- uno\n- dos")).toBe("- uno\n- dos");
  });
});

describe("splitWhatsAppBold", () => {
  it("splits bold spans for rendering", () => {
    expect(splitWhatsAppBold("Precio *$18.50* hoy")).toEqual([
      { text: "Precio ", bold: false },
      { text: "$18.50", bold: true },
      { text: " hoy", bold: false },
    ]);
  });

  it("returns plain text as a single segment", () => {
    expect(splitWhatsAppBold("sin formato")).toEqual([{ text: "sin formato", bold: false }]);
  });
});
