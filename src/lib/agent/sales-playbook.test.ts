import { describe, expect, it } from "vitest";
import {
  AMBIGUOUS_REPLIES,
  BUYING_SIGNALS,
  INSIGHT_OUTCOMES,
  OBJECTION_GUIDES,
  OBJECTION_TYPES,
  renderSalesPlaybook,
} from "@/lib/agent/sales-playbook";
import { buildSystemPrompt, todayInPanama } from "@/lib/agent/system-prompt";
import { FOLLOW_UP_STEPS } from "@/lib/agent/follow-up-sequence";

const ctx = { customerName: "Empresa Demo", segment: "Distribuidor", reasonText: "Sin compras", strategyText: "Recuperar" };
const prompt = buildSystemPrompt(ctx, { isOpeningMessage: false }, "2026-09-23");

describe("sales playbook", () => {
  it("has a guide for every objection situation the agent must handle", () => {
    expect(OBJECTION_GUIDES.map((g) => g.id)).toEqual([
      "sin_interes", "proveedor_actual", "precio", "mala_experiencia", "desconfianza",
      "inventario", "presupuesto", "autoridad", "pensarlo", "mas_adelante", "opt_out",
    ]);
    for (const guide of OBJECTION_GUIDES) {
      expect(guide.rules.length).toBeGreaterThan(0);
      expect(prompt).toContain(guide.situation);
      for (const rule of guide.rules) expect(prompt).toContain(rule);
    }
  });

  it("classifies objections into the eight required types", () => {
    expect([...OBJECTION_TYPES]).toEqual([
      "precio", "servicio", "confianza", "necesidad", "tiempo", "inventario", "presupuesto", "autoridad",
    ]);
  });

  it("describes the internal eight-step process and keeps it hidden from the customer", () => {
    const playbook = renderSalesPlaybook();
    const steps = playbook.split("\n").filter((line) => /^\d\. /.test(line));
    expect(steps).toHaveLength(8);
    expect(playbook).toMatch(/interno: nunca lo menciones/);
  });

  it("lists buying signals and ambiguous replies that are never a confirmation", () => {
    for (const signal of BUYING_SIGNALS) expect(prompt).toContain(signal);
    for (const reply of AMBIGUOUS_REPLIES) expect(prompt).toContain(`"${reply}"`);
    for (const outcome of INSIGHT_OUTCOMES) expect(prompt).toContain(outcome);
  });

  it("does not repeat any rule between the base prompt and the playbook", () => {
    const lines = prompt.split("\n").map((l) => l.trim()).filter((l) => l.length > 25);
    const duplicates = lines.filter((line, i) => lines.indexOf(line) !== i);
    expect(duplicates).toEqual([]);
  });

  it("no longer tells the agent to counter-offer the maximum approvable discount", () => {
    expect(prompt).not.toMatch(/ofrece como máximo el límite autorizable/);
    expect(prompt).toMatch(/Nunca concedas de una vez más de lo que el cliente pidió ni el máximo autorizable/);
  });

  it("negotiates like a salesperson: holds price, accepts a good ask, offers its best price below the margin", () => {
    expect(prompt).toMatch(/Si el cliente no pide rebaja, sostén el precio de lista/);
    expect(prompt).toMatch(/Nunca ofrezcas por debajo de lo que pidió/);
    expect(prompt).toMatch(/Si su precio queda dentro de tu margen .* acéptalo tal cual/);
    expect(prompt).toMatch(/Si pide por debajo de tu margen, no lo aceptes de una vez: ofrece tu mejor precio/);
    expect(prompt).toMatch(/Solo si insiste en su precio, solicita la aprobación/);
    expect(prompt).toContain("netUnitPrice");
  });

  it("treats a yes to the confirmation question as a confirmation and hands payment to the system", () => {
    expect(prompt).toMatch(/Un "sí" a tu pregunta de confirmación es una confirmación/);
    expect(prompt).toMatch(/Nunca le pidas que escriba una frase exacta/);
    expect(prompt).toMatch(/el sistema le envía al cliente el enlace de pago/);
  });

  it("keeps WhatsApp formatting free of double asterisks and Markdown headings", () => {
    expect(prompt).not.toContain("**");
    expect(prompt).not.toMatch(/^#/m);
  });
});

describe("system prompt", () => {
  it("gives the model today's date so it can store follow-up dates", () => {
    expect(prompt).toContain("Fecha de hoy: 2026-09-23");
  });

  it("computes today in Panama time, not UTC", () => {
    expect(todayInPanama(new Date("2026-09-24T03:00:00Z"))).toBe("2026-09-23");
    expect(todayInPanama(new Date("2026-09-24T06:00:00Z"))).toBe("2026-09-24");
  });

  it("keeps the opening and follow-up instructions", () => {
    expect(buildSystemPrompt(ctx, { isOpeningMessage: true }, "2026-09-23")).toMatch(/primera vez que contactas/);
    const followUp = buildSystemPrompt(ctx, { isOpeningMessage: false, followUp: FOLLOW_UP_STEPS[0] }, "2026-09-23");
    expect(followUp).toContain(FOLLOW_UP_STEPS[0].instruction);
    expect(prompt).not.toMatch(/primera vez que contactas/);
  });
});
