import { describe, expect, it } from "vitest";
import { assertOrderAllowed, customerCommitted, explainNonConfirmation, explainNonConfirmationInContext } from "@/lib/agent/order-guard";

describe("order guard", () => {
  it.each([
    "De acuerdo. Confirmo las 50 unidades con esas condiciones.",
    "Sí, procede con el pedido.",
    "Confirmamos, adelante con el pedido de 200 unidades.",
    "Suena bien, confirmo.",
    "Listo, hazme el pedido.",
  ])("does not block an explicit confirmation: %s", (message) => {
    expect(explainNonConfirmation(message)).toBeNull();
    expect(() => assertOrderAllowed({ trigger: "customer_message", customerMessage: message })).not.toThrow();
  });

  it.each([
    "Lo voy a pensar.",
    "Déjame pensarlo.",
    "Puede ser.",
    "Déjame revisar con mi socio.",
    "Suena bien, déjame revisarlo con mi socio y te aviso.",
    "Tengo que consultarlo con mi jefe.",
    "Tal vez la otra semana.",
    "Te confirmo mañana.",
    "No confirmo todavía.",
    "Todavía no, espera.",
    "No hagas el pedido aún.",
    "Si realmente pueden entregar en 24 horas, podríamos probar con 50 unidades.",
    "Podemos probar nuevamente con 50 unidades.",
    "Me interesan 50 unidades con esas condiciones.",
  ])("blocks a hesitant or negated reply: %s", (message) => {
    expect(explainNonConfirmation(message)).not.toBeNull();
    expect(() => assertOrderAllowed({ trigger: "customer_message", customerMessage: message })).toThrow("No se creó el pedido");
  });

  it.each(["opening", "follow_up", "human_decision"] as const)("blocks orders on a %s turn", (trigger) => {
    expect(() => assertOrderAllowed({ trigger, customerMessage: "Confirmo" })).toThrow("mensaje del cliente");
  });

  it("blocks a customer turn without a message", () => {
    expect(() => assertOrderAllowed({ trigger: "customer_message" })).toThrow("mensaje del cliente");
  });
});

describe("confirmation in context", () => {
  it.each(["Si", "Sí", "sí, perfecto", "Si está bien", "Si confirmo el pedido", "Dale", "De acuerdo"])(
    "accepts %s when it answers '¿Confirma el pedido?'",
    (message) => {
      expect(explainNonConfirmationInContext(message, true)).toBeNull();
      expect(() => assertOrderAllowed({ trigger: "customer_message", customerMessage: message, answeringConfirmationRequest: true })).not.toThrow();
    },
  );

  it.each(["Si", "Dale", "Mucho mejor"])("does not accept %s when no confirmation was asked", (message) => {
    expect(explainNonConfirmationInContext(message, false)).not.toBeNull();
  });

  it.each(["Mucho mejor", "Sí, déjame pensarlo", "Si, pero todavía no", "Suena bien"])(
    "never accepts %s, even answering a confirmation request",
    (message) => expect(explainNonConfirmationInContext(message, true)).not.toBeNull(),
  );
});

describe("commitment before asking Abdiel for a special price", () => {
  const conditional = "Entiendo. $17.00 por unidad sería un precio especial de contado. Si consigo que Abdiel, el gerente, me lo autorice para las 50 unidades, ¿le dejo listo hoy el pedido con entrega mañana?";

  it("real case 2026-09-27 13:16 UTC: 'Si puede ser' to the conditional close is enough to ask Abdiel", () => {
    expect(customerCommitted("Si puede ser", conditional)).toBe(true);
    expect(customerCommitted("Sí, dale", conditional)).toBe(true);
  });

  it("without a yes, or with a no, it is not a commitment", () => {
    expect(customerCommitted("Puede ser", conditional)).toBe(false);
    expect(customerCommitted("Tal vez, lo veo", conditional)).toBe(false);
    expect(customerCommitted("Si me lo dejas a 850 puedo considerarlo", "¿Se lo dejo listo?")).toBe(false);
    expect(customerCommitted("Todavía no", conditional)).toBe(false);
  });

  it("an outright purchase counts without the question", () => {
    expect(customerCommitted("Si me lo dejas a 17.00 te lo compro", null)).toBe(true);
  });
});
