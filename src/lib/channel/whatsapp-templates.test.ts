import { describe, expect, it } from "vitest";
import {
  FOLLOW_UP_TEMPLATES,
  OPT_OUT_FOOTER,
  PAYMENT_LINK_BUTTON,
  SENDER_NAME,
  WHATSAPP_TEMPLATES,
  countPlaceholders,
  isExplicitOptOutText,
  isOptOutButtonText,
  openingTemplateForSignal,
  renderTemplate,
  sanitizeTemplateParam,
} from "@/lib/channel/whatsapp-templates";

const templates = Object.values(WHATSAPP_TEMPLATES);
const outreach = templates.filter((t) => t.category === "MARKETING");
const payment = templates.filter((t) => t.category === "UTILITY");

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
    expect(t.name).toMatch(/^[a-z0-9_]+$/);
    // Quick replies: at most 3 so demo mode can send them as reply buttons, 20 chars each.
    expect(t.buttons.length).toBeLessThanOrEqual(3);
    if (t.linkButton) {
      expect(t.linkButton.text.length).toBeLessThanOrEqual(20);
      expect(t.buttons).toEqual([]);
    }
    for (const button of t.buttons) expect(button.length).toBeLessThanOrEqual(20);
    expect((t.footer ?? "").length).toBeLessThanOrEqual(60);
    expect(t.footer ?? "").not.toMatch(/\{\{/);
  });
});

describe("outreach templates follow the commercial style", () => {
  it.each(outreach.map((t) => [t.name, t] as const))("%s", (_name, t) => {
    expect(t.buttons.length).toBeGreaterThan(0);
    // Formal treatment: no "tú" forms.
    expect(t.body).not.toMatch(/\b(te|tu|tus|tienes|necesitas|quieres|dime)\b/i);
    // One important question per message.
    expect(t.body.match(/\?/g)).toHaveLength(1);
    // Short enough to read at a glance on a phone.
    expect(t.body.replace(/\{\{\d+\}\}/g, "X").length).toBeLessThanOrEqual(220);
    expect(t.footer).toBe(OPT_OUT_FOOTER);
  });

  it("openings are signed by the sender and name the company", () => {
    for (const name of ["apertura_recompra", "apertura_reactivacion", "apertura_producto"] as const) {
      expect(WHATSAPP_TEMPLATES[name].body).toContain(`le escribe ${SENDER_NAME} de Nova Distribution`);
      expect(WHATSAPP_TEMPLATES[name].params[0].label).toBe("Empresa");
    }
  });

  it("payment templates are UTILITY: about the customer's own order, in usted, with the payment button and no promotion", () => {
    expect(payment.map((t) => t.name)).toEqual([
      "cobro_credito", "cobro_contado", "recordatorio_pago", "pago_vence_hoy", "pago_vencido", "pago_recibido",
    ]);
    for (const t of payment) {
      expect(t.body).toMatch(/pedido #\{\{\d\}\}/);
      expect(t.body).not.toMatch(/\b(te|tu|tus|puedes|dime)\b/i);
      expect(t.body).not.toMatch(/descuento|oferta|promoci[oó]n|aprovech/i);
      expect(t.body.replace(/\{\{\d+\}\}/g, "X").length).toBeLessThanOrEqual(220);
      if (t.name !== "pago_recibido") expect(t.linkButton).toEqual(PAYMENT_LINK_BUTTON);
    }
    expect(WHATSAPP_TEMPLATES.pago_recibido.linkButton).toBeUndefined();
  });

  it("no longer has the empty 'retomo mi mensaje' reminder", () => {
    expect(Object.keys(WHATSAPP_TEMPLATES)).not.toContain("seguimiento_recordatorio");
    for (const t of templates) expect(t.body).not.toMatch(/retomo mi mensaje/i);
  });

  it("the opt-out footer uses a word the webhook honors", () => {
    expect(OPT_OUT_FOOTER).toContain("BAJA");
    expect(isExplicitOptOutText("BAJA")).toBe(true);
  });
});

describe("renderTemplate", () => {
  it("fills placeholders in order with the customer's real last order", () => {
    expect(renderTemplate("apertura_recompra", ["Distribuidora Belleza del Istmo", "50", "Shampoo Professional 1L", "6"])).toBe(
      "Hola, le escribe Fernán de Nova Distribution. El último pedido de Distribuidora Belleza del Istmo fue de 50 unidades de Shampoo Professional 1L, hace 6 semanas. ¿Le preparo la misma cantidad para esta semana?",
    );
  });

  it("rejects the wrong number of parameters", () => {
    expect(() => renderTemplate("apertura_recompra", ["Empresa Demo"])).toThrow();
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
    expect(FOLLOW_UP_TEMPLATES).toEqual({ 1: "seguimiento_valor", 2: "seguimiento_angulo", 3: "seguimiento_cierre" });
  });

  it("recognizes opt-out buttons, old and Meta's native one, but not ordinary quick replies", () => {
    expect(isOptOutButtonText("No me interesa")).toBe(true);
    expect(isOptOutButtonText(" no me interesa ")).toBe(true);
    expect(isOptOutButtonText("Detener promociones")).toBe(true);
    expect(isOptOutButtonText("Ahora no")).toBe(false);
    for (const t of templates) for (const button of t.buttons) expect(isOptOutButtonText(button)).toBe(false);
  });

  it("only stops outreach automatically for clear written requests", () => {
    expect(isExplicitOptOutText("No me escriban más")).toBe(true);
    expect(isExplicitOptOutText("STOP")).toBe(true);
    expect(isExplicitOptOutText("Ahora no")).toBe(false);
    expect(isExplicitOptOutText("No me interesa el precio, pero sí el producto")).toBe(false);
  });
});
