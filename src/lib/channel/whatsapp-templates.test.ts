import { describe, expect, it } from "vitest";
import {
  FOLLOW_UP_TEMPLATES,
  WHATSAPP_TEMPLATES,
  countPlaceholders,
  isExplicitOptOutText,
  isOptOutButtonText,
  openingTemplateForSignal,
  renderTemplate,
  sanitizeTemplateParam,
} from "@/lib/channel/whatsapp-templates";

const templates = Object.values(WHATSAPP_TEMPLATES);

describe("templates satisfy Meta's creation rules", () => {
  it.each(templates.map((t) => [t.name, t] as const))("%s", (_name, t) => {
    const placeholders = countPlaceholders(t.body);
    expect(t.params).toHaveLength(placeholders);
    expect(t.body.trimStart().startsWith("{{")).toBe(false);
    expect(t.body.trimEnd().endsWith("}}")).toBe(false);
    expect(t.body).not.toMatch(/\}\}\s*\{\{/);
    const words = t.body.replace(/\{\{\d+\}\}/g, "").split(/\s+/).filter(Boolean).length;
    expect(words).toBeGreaterThanOrEqual(3 * placeholders + 1);
    expect(t.body.length).toBeLessThanOrEqual(1024);
    expect(t).not.toHaveProperty("buttons");
    expect(t.name).toMatch(/^[a-z0-9_]+$/);
  });
});

describe("renderTemplate", () => {
  it("fills placeholders in order", () => {
    expect(renderTemplate("seguimiento_recordatorio", ["Empresa Demo", "Shampoo Professional 1L"])).toBe(
      "Hola Empresa Demo, retomo mi mensaje sobre Shampoo Professional 1L. ¿Están cubiertos por ahora o prevén reponer pronto?",
    );
  });

  it("rejects the wrong number of parameters", () => {
    expect(() => renderTemplate("seguimiento_recordatorio", ["Empresa Demo"])).toThrow();
  });
});

describe("sanitizeTemplateParam", () => {
  it("removes line breaks, tabs and repeated spaces that Meta rejects", () => {
    expect(sanitizeTemplateParam("  Empresa\nDemo\t  S.A.  ")).toBe("Empresa Demo S.A.");
  });
});

describe("template selection", () => {
  it("maps each detected signal to an opening template", () => {
    expect(openingTemplateForSignal("recompra_atrasada")).toBe("apertura_recompra");
    expect(openingTemplateForSignal("reduccion_frecuencia")).toBe("apertura_recompra");
    expect(openingTemplateForSignal("cambio_competidor")).toBe("apertura_producto");
    expect(openingTemplateForSignal("inactividad")).toBe("apertura_reactivacion");
    expect(openingTemplateForSignal("caida_ticket")).toBe("apertura_reactivacion");
    expect(openingTemplateForSignal(null)).toBe("apertura_reactivacion");
  });

  it("has a template for every follow-up step", () => {
    expect(Object.keys(FOLLOW_UP_TEMPLATES)).toEqual(["1", "2", "3", "4"]);
  });

  it("recognizes the opt-out button", () => {
    expect(isOptOutButtonText("No me interesa")).toBe(true);
    expect(isOptOutButtonText(" no me interesa ")).toBe(true);
    expect(isOptOutButtonText("Ahora no")).toBe(false);
  });

  it("only stops outreach automatically for clear written requests", () => {
    expect(isExplicitOptOutText("No me escriban más")).toBe(true);
    expect(isExplicitOptOutText("STOP")).toBe(true);
    expect(isExplicitOptOutText("Ahora no")).toBe(false);
    expect(isExplicitOptOutText("No me interesa el precio, pero sí el producto")).toBe(false);
  });
});
