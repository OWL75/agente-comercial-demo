import { describe, expect, it } from "vitest";
import { assertOrderAllowed, explainNonConfirmation } from "@/lib/agent/order-guard";

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
