import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Deterministic objection-handling scenarios. A scripted stand-in for the
 * model drives the REAL runtime, tool registry, policy engine and SQL (in
 * PostgreSQL/WASM). The same checks used by the live-model QA judge the
 * effects, and deliberately bad scripts prove the checks catch violations.
 * This proves plumbing, guards and checks — not the live model's judgment,
 * which only `npm run qa:scenarios` against an isolated QA database can show.
 */

type Step = { calls: Array<[string, Record<string, unknown>]> } | { say: string };

const h = vi.hoisted(() => ({
  script: [] as Array<{ calls: Array<[string, Record<string, unknown>]> } | { say: string }>,
  instructions: [] as string[],
  sent: [] as string[],
  callId: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => {
  const { sql } = await import("./sql-harness");
  return { sql, toJsonb: sql.json };
});
vi.mock("@/lib/channel/whatsapp-client", () => ({
  isWhatsAppConfigured: () => false,
  sendWhatsAppMessage: async (_to: string, body: string) => { h.sent.push(body); },
}));
vi.mock("@/lib/agent/openai-client", () => ({
  getAgentModel: () => "scripted-model",
  getOpenAiClient: () => ({
    responses: {
      create: async (request: { instructions: string }) => {
        h.instructions.push(request.instructions);
        const step = h.script.shift();
        if (!step) throw new Error("El guion del modelo se agotó.");
        if ("say" in step) return { output: [], output_text: step.say };
        return {
          output_text: "",
          output: step.calls.map(([name, args]) => ({
            type: "function_call", call_id: `call_${++h.callId}`, name, arguments: JSON.stringify(args),
          })),
        };
      },
    },
  }),
}));

import { database } from "./sql-harness";
import { runTracedConversation } from "@/lib/qa/trace";
import { ADDITIONAL_OBJECTION_SCENARIOS, MAIN_OBJECTION_SCENARIO, type ObjectionScenario } from "@/lib/qa/objection-scenarios";
import type { Check, ScenarioTrace } from "@/lib/qa/objection-checks";
import { todayInPanama } from "@/lib/agent/system-prompt";
import { runAgentTurn } from "@/lib/agent/runtime";
import { getFollowUpState, simulateCustomerSilence } from "@/lib/agent/follow-up";
import { decideApproval } from "@/lib/agent/approval-decision";
import { saveCustomerInsight } from "@/lib/tools/customer";

const customerId = "11111111-1111-1111-1111-111111111111";
const conversationId = "22222222-2222-2222-2222-222222222222";
const opportunityId = "33333333-3333-3333-3333-333333333333";
const SKU = "CAP-001";
const policy = {
  discount: { autoMaxPct: 5, approvalMaxPct: 10 },
  credit: { existingConditionAuto: true, increaseRequiresApproval: true },
  delivery: { standardHours: 48, expressHours: 24, expressRequiresEligibleStock: true, extraordinaryRequiresApproval: true },
  stock: { neverConfirmWithoutCheck: true },
};
const today = todayInPanama();

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const calls = (...list: Array<[string, Record<string, unknown>]>): Step => ({ calls: list });
const say = (text: string): Step => ({ say: text });
const save = (fields: Record<string, unknown>): [string, Record<string, unknown>] => ["save_customer_insight", fields];
const stage = (value: string, nextObjective = "Siguiente paso"): [string, Record<string, unknown>] =>
  ["update_opportunity_stage", { stage: value, nextObjective }];
const tool = (name: string, args: Record<string, unknown> = {}): [string, Record<string, unknown>] => [name, args];

async function play(scenario: ObjectionScenario, turns: Step[][], messages = scenario.messages): Promise<ScenarioTrace> {
  h.script = turns.flat();
  const trace = await runTracedConversation(conversationId, { opening: scenario.opening, messages });
  expect(h.script, "el guion debe consumirse por completo").toHaveLength(0);
  return trace;
}

function failing(checks: Check[]): string[] {
  return checks.filter((c) => !c.pass).map((c) => c.name);
}

function expectAllPass(checks: Check[]) {
  expect(checks.filter((c) => !c.pass).map((c) => `${c.name}: ${c.detail}`)).toEqual([]);
}

async function setAgentLastMessage() {
  // The follow-up gate only applies after the agent spoke last, as in production.
  const { rows } = await database.query<{ sender: string }>(
    "select sender from agente_comercial.messages where conversation_id=$1 order by created_at desc limit 1", [conversationId]);
  expect(rows[0]?.sender).toBe("agent");
}

beforeAll(async () => {
  await database.exec(await readFile(new URL("./fixtures/demo-schema.sql", import.meta.url), "utf8"));
}, 30000);
beforeEach(async () => {
  h.script = [];
  h.instructions = [];
  h.sent = [];
  await database.exec("truncate agente_comercial.customers, agente_comercial.products, agente_comercial.commercial_policies cascade");
  await database.query(
    "insert into agente_comercial.customers (id, name, credit_total, credit_available, payment_terms) values ($1, 'Cliente QA', 15000, 12000, '30 días')",
    [customerId]);
  await database.query("insert into agente_comercial.opportunities (id, customer_id, status) values ($1, $2, 'contactada')", [opportunityId, customerId]);
  await database.query("insert into agente_comercial.conversations (id, customer_id, opportunity_id, stage) values ($1, $2, $3, 'discovery')",
    [conversationId, customerId, opportunityId]);
  await database.exec(`insert into agente_comercial.products (sku,name,unit_price,stock,express_eligible) values
    ('CAP-001','Shampoo Professional 1L',18.50,820,true), ('CAP-005','Mascarilla Hidratante',13.40,280,true)`);
  await database.query("insert into agente_comercial.commercial_policies (version,config) values (1,$1)", [JSON.stringify(policy)]);
});
afterAll(async () => { await database.close(); });

// ---------------------------------------------------------------------------
// Main scenario (spec section 6)
// ---------------------------------------------------------------------------

const opening = [say("Hola, soy de Nova Distribution. Vi que hace un tiempo no nos compran, ¿cómo les ha ido?")];
const t1 = [
  calls(
    save({ competidorMencionado: "Proveedor actual (sin nombre)", motivoInactividad: "Compra con otro proveedor", objecion: "necesidad: dice no estar interesado" }),
    stage("objection_handling", "Entender qué motivó el cambio"),
  ),
  say("Entiendo, gracias por decírmelo. ¿Qué los llevó a cambiar de proveedor?"),
];
const t2 = [
  calls(save({ motivoInactividad: "Mejor precio del competidor y una entrega tardía reportada", objecion: "precio: el competidor mejoró el precio" })),
  say("Tiene sentido. ¿Qué producto y qué volumen manejan normalmente?"),
];
const t3 = [
  calls(
    save({ productoInteres: "Shampoo Professional 1L (CAP-001)", cantidad: 50, precioObjetivo: 17.75, condicionSolicitada: "Entrega al día siguiente" }),
    tool("get_product_price", { sku: SKU }),
    tool("get_inventory", { sku: SKU }),
    tool("get_delivery_options", { sku: SKU }),
    tool("get_discount_policy"),
    stage("negotiating", "Resolver la preocupación por la entrega"),
  ),
  say("Gracias. Tenemos stock para ese volumen y podemos acercarnos a ese precio. ¿Qué es lo que más te preocupa para volver a probar?"),
];
const t4 = [
  calls(save({ objecion: "servicio: le preocupa otro atraso en la entrega" }), tool("get_delivery_options", { sku: SKU }), tool("get_inventory", { sku: SKU }),
    tool("prepare_verified_offer", { sku: SKU, quantity: 50, discountPct: 0, deliveryHours: 24 })),
  say("Lo entiendo. Hoy tenemos 820 unidades y el producto califica para entrega express en 24 horas. ¿Te serviría probar con un pedido?"),
];
const t5 = (pct = 4) => [
  calls(
    tool("get_product_price", { sku: SKU }),
    tool("get_inventory", { sku: SKU }),
    tool("get_credit_status"),
    tool("get_discount_policy", { requestedPct: pct }),
    tool("prepare_verified_offer", { sku: SKU, quantity: 50, discountPct: pct, deliveryHours: 24 }),
    save({ intencionCompra: "Pedido de prueba de 50 unidades", condicionSolicitada: "Entrega 24 h y pago a 30 días", resultado: "en_negociacion" }),
    stage("closing", "Obtener confirmación explícita"),
  ),
  say(`La oferta final es: 50 Shampoo Professional 1L a $17.76 por unidad con ${pct}% de descuento, total $888.00, entrega en 24 horas y pago a 30 días. ¿Confirmas el pedido?`),
];
const t6 = (pct = 4) => [
  calls(tool("get_inventory", { sku: SKU }), tool("create_sandbox_order", { items: [{ sku: SKU, quantity: 50 }], discountPct: pct, creditTerms: "30 días", deliveryHours: 24 })),
  calls(save({ resultado: "pedido_confirmado" })),
  say("Listo, pedido registrado. Te confirmo la entrega en 24 horas."),
];

describe("main objection scenario through the real runtime", () => {
  it("recovers the customer and creates the order only after the explicit confirmation", async () => {
    const trace = await play(MAIN_OBJECTION_SCENARIO, [opening, t1, t2, t3, t4, t5(), t6()]);
    expectAllPass(MAIN_OBJECTION_SCENARIO.evaluate(trace, today));

    const order = trace.turns.at(-1)!.orders[0];
    expect(order).toMatchObject({ subtotal: 925, discount_pct: 4, total: 888, credit_terms: "30 días", delivery_option: "24 horas" });
    expect(order.items).toEqual([{ sku: SKU, quantity: 50, unit_price: 18.5 }]);
    expect(trace.turns.map((t) => t.stage)).toEqual([
      "discovery", "objection_handling", "objection_handling", "negotiating", "negotiating", "closing", "closed",
    ]);
    expect(trace.turns.at(-1)!.insight).toMatchObject({ cantidad: 50, precio_objetivo: 17.75, resultado: "pedido_confirmado" });
    expect(trace.turns.at(-1)!.approvals).toEqual([]);
    expect(h.sent).toEqual([]);
  });

  it("sends the playbook and today's date to the model on every call", async () => {
    await play(MAIN_OBJECTION_SCENARIO, [opening, t1], MAIN_OBJECTION_SCENARIO.messages.slice(0, 1));
    expect(h.instructions.length).toBeGreaterThan(0);
    for (const instructions of h.instructions) {
      expect(instructions).toContain("Método comercial");
      expect(instructions).toContain(`Fecha de hoy: ${today}`);
    }
  });

  it("flags a discount offered in the first turn", async () => {
    const eager = [calls(tool("get_discount_policy", { requestedPct: 5 }), save({ competidorMencionado: "Otro" })), say("Te hago 5% ya mismo.")];
    const trace = await play(MAIN_OBJECTION_SCENARIO, [opening, eager], MAIN_OBJECTION_SCENARIO.messages.slice(0, 1));
    expect(failing(MAIN_OBJECTION_SCENARIO.evaluate(trace, today))).toEqual(expect.arrayContaining([
      "Sin descuento, aprobación ni pedido hasta el turno 1",
      "Hizo descubrimiento antes de negociar",
    ]));
  });

  it("flags an order created on the conditional message before the confirmation", async () => {
    const premature = [
      calls(tool("get_inventory", { sku: SKU }), tool("create_sandbox_order", { items: [{ sku: SKU, quantity: 50 }], discountPct: 4, creditTerms: "30 días", deliveryHours: 24 })),
      say("Listo, pedido creado."),
    ];
    const trace = await play(MAIN_OBJECTION_SCENARIO, [opening, t1, t2, t3, t4, premature], MAIN_OBJECTION_SCENARIO.messages.slice(0, 5));
    expect(trace.turns.at(-1)!.orders).toHaveLength(0);
    expect(trace.turns.at(-1)!.failedCalls).toEqual([
      { tool: "create_sandbox_order", error: expect.stringContaining("confirmación explícita") },
    ]);
  });

  it("flags conceding the maximum autonomous discount when less reaches the target price", async () => {
    const trace = await play(MAIN_OBJECTION_SCENARIO, [opening, t1, t2, t3, t4, t5(5), t6(5)]);
    expect(trace.turns.at(-1)!.orders).toHaveLength(0);
    expect(trace.turns.at(-1)!.failedCalls).toEqual([
      { tool: "create_sandbox_order", error: expect.stringContaining("oferta verificada") },
    ]);
  });

  it("flags an unnecessary human approval for a discount inside autonomy", async () => {
    const withApproval = [
      calls(tool("request_approval", { type: "discount", productSku: SKU, quantity: 50, requestedPct: 4, reason: "Precio", agentRecommendation: "Aprobar" })),
      ...t5(),
    ];
    const trace = await play(MAIN_OBJECTION_SCENARIO, [opening, t1, t2, t3, t4, withApproval, t6()]);
    expect(trace.turns.flatMap((turn) => turn.failedCalls)).toContainEqual({
      tool: "request_approval", error: expect.stringContaining("no requiere aprobación"),
    });
    expectAllPass(MAIN_OBJECTION_SCENARIO.evaluate(trace, today));
  });
});

// ---------------------------------------------------------------------------
// Additional scenarios (spec section 7)
// ---------------------------------------------------------------------------

const scenario = (id: string) => ADDITIONAL_OBJECTION_SCENARIOS.find((s) => s.id === id)!;

describe("additional objection scenarios through the real runtime", () => {
  it("1. excess inventory: schedules a follow-up with no discount or order, and pauses the sequence", async () => {
    const s = scenario("inventario");
    const trace = await play(s, [
      [calls(save({ objecion: "inventario: tiene stock suficiente", motivoInactividad: "Inventario suficiente" }), stage("objection_handling")),
        say("Perfecto, entonces no tiene sentido cargarte más ahora. ¿Para cuándo calculas que vas a necesitar reponer?")],
      [calls(save({ resultado: "seguimiento_acordado", proximaAccion: "Retomar reposición de shampoo", proximaFecha: addDays(today, 22), resumen: "Inventario suficiente; repone en ~3 semanas" })),
        say("Anotado, te escribo a mediados del próximo mes. ¡Gracias!")],
    ]);
    expectAllPass(s.evaluate(trace, today));
    await setAgentLastMessage();
    expect((await getFollowUpState(conversationId)).blockedReason).toMatch(/pidió retomar el/);
  });

  it("1b. excess inventory: flags a discount used to push an early purchase", async () => {
    const s = scenario("inventario");
    const trace = await play(s, [
      [calls(tool("get_discount_policy", { requestedPct: 5 })), say("Si compras hoy te hago 5%.")],
      [say("Ok.")],
    ]);
    expect(failing(s.evaluate(trace, today))).toEqual(expect.arrayContaining(["No negoció descuento, excepción ni pedido"]));
  });

  it("2. no budget: reviews the existing credit without requesting an increase", async () => {
    const s = scenario("presupuesto");
    const trace = await play(s, [
      [calls(save({ objecion: "presupuesto: flujo de caja apretado este mes" }), tool("get_credit_status")),
        say("Te entiendo. Tienes tu crédito vigente a 30 días; ¿te ayudaría eso a no afectar la caja este mes?")],
      [calls(save({ productoInteres: "Shampoo Professional 1L", cantidad: 50, resultado: "seguimiento_acordado", proximaAccion: "Revisar compra con crédito vigente", proximaFecha: addDays(today, 14) })),
        say("Sin problema. ¿Te parece si lo retomamos en dos semanas?")],
    ]);
    expectAllPass(s.evaluate(trace, today));
  });

  it("2b. no budget: flags a credit increase that was never requested", async () => {
    const s = scenario("presupuesto");
    const trace = await play(s, [
      [calls(tool("get_credit_status", { requestingIncreaseOrNew: true }),
        tool("request_approval", { type: "credit", productSku: SKU, quantity: 50, requestedCreditAmount: 2000, reason: "Caja", agentRecommendation: "Aprobar" })),
        say("Te pido más crédito.")],
      [say("Ok.")],
    ]);
    expect(failing(s.evaluate(trace, today))).toEqual(expect.arrayContaining([
      "Clasificó la objeción como presupuesto",
      "No consultó un aumento de crédito que el cliente no pidió",
      "No creó aprobación de credit",
    ]));
  });

  it("3. needs the boss: records the authority objection and the next action", async () => {
    const s = scenario("jefe");
    const trace = await play(s, [
      [calls(save({ objecion: "autoridad: la compra la decide su jefe" })), say("Claro. ¿Qué necesitaría ver tu jefe para decidir?")],
      [calls(tool("get_product_price", { sku: SKU }), tool("get_delivery_options", { sku: SKU }),
        save({ proximaAccion: "Enviar precio y entrega para 50 unidades al jefe", proximaFecha: addDays(today, 8), resultado: "seguimiento_acordado" })),
        say("Perfecto, te dejo el precio y la entrega para que se los compartas. Te escribo el jueves.")],
    ]);
    expectAllPass(s.evaluate(trace, today));
  });

  it("4. think it over: clarifies the concern and agrees a follow-up; an order attempt is refused", async () => {
    const s = scenario("pensarlo");
    const trace = await play(s, [
      [calls(tool("create_sandbox_order", { items: [{ sku: SKU, quantity: 50 }], discountPct: 0, creditTerms: "30 días", deliveryHours: 48 })),
        calls(save({ objecion: "tiempo: quiere pensarlo" })),
        say("Claro. ¿Qué te gustaría evaluar con más calma: precio, entrega o cantidad?")],
      [calls(save({ objecion: "precio: quiere comparar con lo que paga hoy", proximaAccion: "Comparar precio con su proveedor", proximaFecha: addDays(today, 5), resultado: "seguimiento_acordado" })),
        say("Perfecto, te escribo el lunes para comparar.")],
    ]);
    expect(trace.turns[0].failedCalls).toEqual([{ tool: "create_sandbox_order", error: expect.stringContaining("duda") }]);
    expectAllPass(s.evaluate(trace, today));
  });

  it("5. persistent distrust: no invented guarantee, approval or order", async () => {
    const s = scenario("desconfianza");
    const trace = await play(s, [
      [calls(save({ objecion: "confianza: teme otro incumplimiento de entrega" }), tool("get_inventory", { sku: SKU }), tool("get_delivery_options", { sku: SKU })),
        say("Entiendo la preocupación. ¿Qué necesitarías ver para volver a confiar en nosotros?")],
      [calls(save({ resultado: "en_conversacion", resumen: "Sigue sin confianza; no autorizó seguimiento" })),
        say("Lo respeto. Si en algún momento quieres revisarlo, aquí estoy.")],
    ]);
    expectAllPass(s.evaluate(trace, today));
  });

  it("6. 8% discount: files a human approval, cannot order on the resume turn, orders after the customer confirms", async () => {
    const s = scenario("descuento-8");
    const trace = await play(s, [
      [calls(save({ productoInteres: "Shampoo Professional 1L", cantidad: 200, condicionSolicitada: "8% de descuento" }),
        tool("get_product_price", { sku: SKU }), tool("get_inventory", { sku: SKU }), tool("get_discount_policy", { requestedPct: 8 })),
        say("Ese 8% necesito confirmarlo con mi gerente. ¿Es en firme para 200 unidades?")],
      [calls(tool("request_approval", { type: "discount", productSku: SKU, quantity: 200, requestedPct: 8, reason: "Volumen", agentRecommendation: "Aprobar 8%" })),
        say("Listo, ya lo solicité. Te aviso apenas tenga respuesta.")],
    ]);
    expectAllPass(s.evaluate(trace, today));

    const { rows: [approval] } = await database.query<{ id: string }>("select id from agente_comercial.approvals");
    h.script = [
      calls(tool("prepare_verified_offer", { sku: SKU, quantity: 200, discountPct: 8, deliveryHours: 48 }), stage("closing")),
      say("¡Buenas noticias! La oferta final quedó en 200 unidades a $17.02 por unidad con 8%, total $3404.00 y entrega estándar. ¿Confirmas las 200 unidades?"),
    ];
    await decideApproval(approval.id, "approve");
    expect((await database.query("select id from agente_comercial.orders")).rows).toHaveLength(0);

    h.script = [
      calls(tool("get_inventory", { sku: SKU }), tool("create_sandbox_order", { items: [{ sku: SKU, quantity: 200 }], discountPct: 8, creditTerms: "30 días", deliveryHours: 48 })),
      say("Pedido registrado."),
    ];
    await runAgentTurn(conversationId, "Confirmo, procede con las 200 unidades con 8%.");
    expect((await database.query("select total, discount_pct from agente_comercial.orders")).rows).toEqual([{ total: "3404", discount_pct: "8" }]);
  });

  it("7. firm rejection: closes respectfully and the follow-up sequence stops", async () => {
    const s = scenario("rechazo");
    const trace = await play(s, [
      [calls(save({ resultado: "rechazo_firme", competidorMencionado: "Proveedor actual", motivoInactividad: "Decidió quedarse con su proveedor" })),
        say("Entendido, gracias por avisarme. Si más adelante necesitas algo, con gusto te ayudo.")],
    ]);
    expectAllPass(s.evaluate(trace, today));
    await setAgentLastMessage();
    expect((await getFollowUpState(conversationId)).blockedReason).toMatch(/forma definitiva/);
  });

  it("7b. firm rejection: flags a follow-up date the customer never authorized", async () => {
    const s = scenario("rechazo");
    const trace = await play(s, [
      [calls(save({ resultado: "rechazo_firme", proximaFecha: addDays(today, 30) })), say("Te escribo el próximo mes igual.")],
    ]);
    expect(failing(s.evaluate(trace, today))).toEqual(["Guardó sin próxima fecha no autorizada"]);
  });

  it("8. opt-out: records it and sends nothing more", async () => {
    const s = scenario("opt-out");
    const trace = await play(s, [opening, [calls(save({ optOut: true }))]]);
    expectAllPass(s.evaluate(trace, today));
    expect(h.script).toHaveLength(0);
    expect((await getFollowUpState(conversationId)).canSimulate).toBe(false);
  });

  it("9. close without explicit confirmation: the order is refused by the guard", async () => {
    const s = scenario("sin-confirmacion");
    const trace = await play(s, [
      [calls(save({ productoInteres: "Shampoo Professional 1L", cantidad: 50, condicionSolicitada: "Entrega 24 h, crédito 30 días" }),
        tool("get_product_price", { sku: SKU }), tool("get_inventory", { sku: SKU }), tool("get_delivery_options", { sku: SKU }),
        tool("get_credit_status"), tool("prepare_verified_offer", { sku: SKU, quantity: 50, discountPct: 0, deliveryHours: 24 }), stage("closing")),
        say("50 unidades a $18.50, total $925, entrega en 24 horas y crédito a 30 días. ¿Lo confirmas?")],
      [calls(tool("create_sandbox_order", { items: [{ sku: SKU, quantity: 50 }], discountPct: 0, creditTerms: "30 días", deliveryHours: 24 })),
        say("Perfecto, quedo atento a lo que te diga tu socio.")],
    ]);
    expect(trace.turns[1].failedCalls).toEqual([{ tool: "create_sandbox_order", error: expect.stringContaining("No se creó el pedido") }]);
    expectAllPass(s.evaluate(trace, today));
  });
});

// ---------------------------------------------------------------------------
// Guards outside customer turns and insight robustness
// ---------------------------------------------------------------------------

describe("turn guards and insight robustness", () => {
  it("refuses an order on an automatic follow-up turn", async () => {
    h.script = [say("Hola, ¿cómo estás?")];
    await runAgentTurn(conversationId, "Hola");
    h.script = [
      calls(tool("create_sandbox_order", { items: [{ sku: SKU, quantity: 50 }], discountPct: 0, creditTerms: "30 días", deliveryHours: 48 })),
      say("¿Te preparo la cantidad habitual?"),
    ];
    await simulateCustomerSilence(conversationId);
    expect((await database.query("select id from agente_comercial.orders")).rows).toHaveLength(0);
    const { rows } = await database.query<{ label: string }>("select label from agente_comercial.audit_log where label like 'Error en create_sandbox_order%'");
    expect(rows[0].label).toContain("mensaje del cliente");
  });

  it("keeps every other insight when the model sends a free-text follow-up date", async () => {
    const result = await saveCustomerInsight({ customerId, conversationId, competidorMencionado: "Proveedor X", proximaAccion: "Llamar", proximaFecha: "el próximo mes" });
    expect(result).toMatchObject({ rejected: [expect.stringContaining("proximaFecha")] });
    const { rows } = await database.query("select competidor_mencionado, proxima_accion, proxima_fecha from agente_comercial.customer_insights");
    expect(rows).toEqual([{ competidor_mencionado: "Proveedor X", proxima_accion: "Llamar", proxima_fecha: null }]);
  });
});

describe("regression: exact Empresa Demo price and delivery conversation", () => {
  it("waits for delivery approval, asks for a new explicit confirmation, then creates the order", async () => {
    await play(
      MAIN_OBJECTION_SCENARIO,
      [opening, t1, t2],
      MAIN_OBJECTION_SCENARIO.messages.slice(0, 2),
    );
    // Reproduce the historical pending card from the real trace. New code
    // refuses to create this unnecessary approval for an express-eligible SKU,
    // but it must still respect an already-open human decision.
    await database.query(
      `insert into agente_comercial.approvals
        (conversation_id, customer_id, type, status, requested_value, context)
       values ($1, $2, 'delivery', 'pending', $3, $4)`,
      [conversationId, customerId,
        JSON.stringify({ hours: 24, quantity: 50, productSku: SKU }),
        JSON.stringify({ unitPrice: 18.5, policyVersion: 1 })],
    );
    await database.query(
      "update agente_comercial.conversations set stage='awaiting_approval' where id=$1",
      [conversationId],
    );
    const pendingOfferTurn = [
      calls(
        save({
          productoInteres: "Shampoo Professional 1L (CAP-001)", cantidad: 50,
          precioObjetivo: 17.75, condicionSolicitada: "Entrega al día siguiente",
          motivoInactividad: "Mejor precio y una entrega anterior tardía",
        }),
        tool("get_product_price", { sku: SKU }),
        tool("get_discount_policy", { requestedPct: 4 }),
        tool("prepare_verified_offer", { sku: SKU, quantity: 50, discountPct: 4, deliveryHours: 24 }),
      ),
      say("Entiendo que actualmente pagas aproximadamente $17.75. La entrega en 24 horas requiere aprobación y ya la solicité; te confirmo cuando tenga respuesta."),
    ];
    const trustTurn = [
      calls(save({ objecion: "confianza: teme otro atraso en la entrega" })),
      say("Entiendo el impacto que tuvo el atraso anterior. Prefiero esperar la validación antes de comprometer una fecha."),
    ];
    const conditionalAttempt = [
      calls(
        tool("create_sandbox_order", {
          items: [{ sku: SKU, quantity: 50 }], discountPct: 4,
          creditTerms: "30 días", deliveryHours: 24,
        }),
        stage("closing"),
      ),
      say("Confirmé la entrega express en 24 horas. ¿Confirmas el pedido?"),
    ];

    h.script = [pendingOfferTurn, trustTurn, conditionalAttempt].flat();
    const trace = await runTracedConversation(conversationId, {
      opening: false,
      messages: MAIN_OBJECTION_SCENARIO.messages.slice(2, 5),
    });
    expect(h.script).toHaveLength(0);
    const conditional = trace.turns.at(-1)!;
    expect(conditional.customerMessage).toContain("podemos probar");
    expect(conditional.orders).toHaveLength(0);
    expect(conditional.stage).toBe("awaiting_approval");
    expect(conditional.failedCalls).toEqual(expect.arrayContaining([
      { tool: "create_sandbox_order", error: expect.stringContaining("duda") },
      { tool: "update_opportunity_stage", error: expect.stringContaining("awaiting_approval") },
    ]));
    expect(conditional.reply).toContain("todavía requiere aprobación");

    const { rows: [approval] } = await database.query<{ id: string }>(
      "select id from agente_comercial.approvals where type='delivery' and status='pending'",
    );
    h.script = [
      calls(
        tool("prepare_verified_offer", { sku: SKU, quantity: 50, discountPct: 4, deliveryHours: 24 }),
        stage("closing", "Obtener una confirmación explícita nueva"),
      ),
      say("La entrega en 24 horas fue aprobada. Oferta final:\n\n* 50 unidades\n* 4% de descuento\n* $17.76 por unidad\n* Total $888.00\n* Pago a 30 días\n\n¿Confirmas el pedido con estas condiciones?"),
    ];
    await decideApproval(approval.id, "approve");
    expect((await database.query("select id from agente_comercial.orders")).rows).toHaveLength(0);
    const { rows: [afterApproval] } = await database.query<{ body: string }>(
      "select body from agente_comercial.messages where sender='agent' order by created_at desc limit 1",
    );
    expect(afterApproval.body).toContain("¿Confirmas el pedido");
    expect(afterApproval.body).toContain("$17.76");
    expect(afterApproval.body).toContain("$888.00");

    h.script = [
      calls(tool("create_sandbox_order", {
        items: [{ sku: SKU, quantity: 50 }], discountPct: 4,
        creditTerms: "30 días", deliveryHours: 24,
      })),
      say("Listo, pedido registrado con entrega aprobada en 24 horas."),
    ];
    await runAgentTurn(conversationId, "De acuerdo. Confirmo las 50 unidades con esas condiciones.");
    expect((await database.query(
      "select subtotal, discount_pct, total, delivery_option from agente_comercial.orders",
    )).rows).toEqual([{ subtotal: "925", discount_pct: "4", total: "888", delivery_option: "24 horas" }]);
  });
});
