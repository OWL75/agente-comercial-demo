import { readFile } from "node:fs/promises";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Replay of the real 2026-09-24 14:22–14:34 UTC conversation end, through the
 * real runtime, tools, policy engine and SQL (PostgreSQL/WASM) with a
 * scripted model and fake Telegram:
 * - the customer asked $17.70 and the agent jumped to $17.58;
 * - "Si" / "Si está bien" / "Si confirmo el pedido" never created the order
 *   and the agent kept re-presenting the same offer;
 * - there was no payment step.
 */

type Step = { calls: Array<[string, Record<string, unknown>]> } | { say: string };

const h = vi.hoisted(() => ({
  script: [] as Array<{ calls: Array<[string, Record<string, unknown>]> } | { say: string }>,
  instructions: [] as string[],
  telegram: [] as Array<{ text: string; markup?: Record<string, unknown>; messageId: number }>,
  nextMessageId: 500,
  callId: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => {
  const { sql } = await import("./sql-harness");
  return { sql, toJsonb: sql.json };
});
vi.mock("@/lib/channel/whatsapp-client", () => ({
  isWhatsAppConfigured: () => false,
  sendWhatsAppMessage: async () => ({ messageId: null }),
  sendWhatsAppLinkButton: async () => ({ messageId: null }),
}));
vi.mock("@/lib/channel/telegram-client", () => ({
  isTelegramConfigured: () => true,
  sendTelegramMessage: async (_chatId: string, text: string, markup?: Record<string, unknown>) => {
    const messageId = ++h.nextMessageId;
    h.telegram.push({ text, markup, messageId });
    return { messageId };
  },
  answerTelegramCallback: async () => undefined,
  closeTelegramButtons: async () => undefined,
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
          output: step.calls.map(([name, args]) => ({ type: "function_call", call_id: `call_${++h.callId}`, name, arguments: JSON.stringify(args) })),
        };
      },
    },
  }),
}));

import { database } from "./sql-harness";
import { runAgentTurn } from "@/lib/agent/runtime";
import { handleTelegramUpdate } from "@/lib/agent/owner-telegram";
import { findPayment, markPaymentReceived, publicBaseUrl, reportPaymentIssue } from "@/lib/payments/payments";
import { findPendingPaymentConversationByPhone } from "@/lib/agent/conversation-lifecycle";

const customerId = "11111111-1111-1111-1111-111111111111";
const conversationId = "22222222-2222-2222-2222-222222222222";
const opportunityId = "33333333-3333-3333-3333-333333333333";
const policy = {
  discount: { autoMaxPct: 5, approvalMaxPct: 10 },
  credit: { existingConditionAuto: true, increaseRequiresApproval: true },
  delivery: { standardHours: 48, expressHours: 24, expressRequiresEligibleStock: true, extraordinaryRequiresApproval: true },
  stock: { neverConfirmWithoutCheck: true },
};

const calls = (...list: Array<[string, Record<string, unknown>]>): Step => ({ calls: list });
const say = (text: string): Step => ({ say: text });
const tool = (name: string, args: Record<string, unknown> = {}): [string, Record<string, unknown>] => [name, args];

const agentMessages = async () =>
  (await database.query<{ body: string }>("select body from agente_comercial.messages where sender='agent' order by created_at")).rows.map((r) => r.body);
const toolResults = async (name: string) =>
  (await database.query<{ result: Record<string, unknown> }>(
    "select payload->'result' as result from agente_comercial.audit_log where payload->>'tool'=$1 and payload->'result' is not null order by created_at",
    [name])).rows.map((r) => r.result);
const orders = async () =>
  (await database.query<{ total: string; discount_pct: string; status: string }>("select total, discount_pct, status from agente_comercial.orders")).rows;
const tokenFrom = (text: string) => text.match(/\/pagar\/([A-Za-z0-9_-]+)/)![1];

const OFFER_1776 = "Le propongo 50 unidades de Shampoo Professional 1L a $17.76 por unidad, total $888.00, con entrega en 24 horas y crédito a 30 días. ¿Confirma el pedido en estas condiciones?";
const OFFER_1773 = "Puedo dejárselo en $17.73 por unidad: 50 unidades, total $886.50, entrega en 24 horas y crédito a 30 días. ¿Confirma el pedido en estas condiciones?";

/** Customer compares with $17.75 → agent offers $17.76; customer asks $17.70 → agent counters $17.73. */
async function negotiate() {
  h.script = [
    calls(
      tool("save_customer_insight", { productoInteres: "Shampoo Professional 1L", cantidad: 50, precioObjetivo: 17.75 }),
      // The model passed the product name as SKU in the real conversation; it now resolves.
      tool("prepare_verified_offer", { sku: "Shampoo Professional 1L", quantity: 50, netUnitPrice: 17.76, customerAskUnitPrice: 17.75, deliveryHours: 24 }),
    ),
    say(OFFER_1776),
  ];
  await runAgentTurn(conversationId, "Mi proveedor me lo deja a 17.75 y me entrega al día siguiente.");

  h.script = [
    calls(
      tool("save_customer_insight", { precioObjetivo: 17.7 }),
      // What the agent did in the real conversation: 5% → $17.58, below the ask.
      tool("prepare_verified_offer", { sku: "CAP-001", quantity: 50, discountPct: 5, customerAskUnitPrice: 17.7, deliveryHours: 24 }),
    ),
    calls(tool("prepare_verified_offer", { sku: "CAP-001", quantity: 50, netUnitPrice: 17.73, customerAskUnitPrice: 17.7, deliveryHours: 24 })),
    say(OFFER_1773),
  ];
  await runAgentTurn(conversationId, "¿Me lo puede dejar a 17.70?");
}

async function confirmWithSi() {
  h.script = [
    calls(tool("create_sandbox_order", { items: [{ sku: "CAP-001", quantity: 50 }], netUnitPrice: 17.73, creditTerms: "30 días", deliveryHours: 24 })),
    say("¡Perfecto! Su pedido quedó registrado. En el siguiente mensaje le envío cómo pagarlo."),
  ];
  await runAgentTurn(conversationId, "Si");
}

beforeAll(async () => {
  await database.exec(await readFile(new URL("./fixtures/demo-schema.sql", import.meta.url), "utf8"));
}, 30000);
beforeEach(async () => {
  vi.stubEnv("PUBLIC_BASE_URL", "https://demo.test");
  vi.stubEnv("TELEGRAM_OWNER_CHAT_ID", "555001");
  h.script = []; h.instructions = []; h.telegram = [];
  await database.exec("truncate agente_comercial.customers, agente_comercial.products, agente_comercial.commercial_policies, agente_comercial.audit_log cascade");
  await database.query(
    "insert into agente_comercial.customers (id, name, phone, credit_total, credit_available, payment_terms) values ($1, 'Distribuidora Belleza del Istmo', '+507 6601-3325', 15000, 12000, '30 días')",
    [customerId]);
  await database.query("insert into agente_comercial.opportunities (id, customer_id, status) values ($1, $2, 'negociando')", [opportunityId, customerId]);
  await database.query("insert into agente_comercial.conversations (id, customer_id, opportunity_id, stage) values ($1, $2, $3, 'negotiating')",
    [conversationId, customerId, opportunityId]);
  await database.exec("insert into agente_comercial.products (sku,name,unit_price,stock,express_eligible) values ('CAP-001','Shampoo Professional 1L',18.50,820,true)");
  await database.query("insert into agente_comercial.commercial_policies (version,config) values (1,$1)", [JSON.stringify(policy)]);
});
afterEach(() => { vi.unstubAllEnvs(); });
afterAll(async () => { await database.close(); });

describe("negotiation: never below the customer's ask", () => {
  it("refuses the $17.58 jump when the customer asked $17.70 and suggests a $17.73 counter", async () => {
    await negotiate();
    const [first, jump, counter] = await toolResults("prepare_verified_offer");
    expect(first).toMatchObject({ status: "ready", netUnitPrice: 17.76, total: 888 });
    expect(jump).toMatchObject({
      status: "unavailable", reason: "below_customer_ask", netUnitPrice: 17.58, recommendedNetUnitPrice: 17.7,
      negotiation: { customerAskUnitPrice: 17.7, lastOfferedUnitPrice: 17.76, autonomyFloorUnitPrice: 17.58, suggestedCounterUnitPrice: 17.73 },
    });
    expect(counter).toMatchObject({ status: "ready", netUnitPrice: 17.73, total: 886.5, discountPct: 4.1622 });
    expect((await agentMessages()).at(-1)).toBe(OFFER_1773);
  });

  it("keeps price concessions inside the agent's autonomy", async () => {
    await negotiate();
    h.script = [
      calls(tool("prepare_verified_offer", { sku: "CAP-001", quantity: 50, netUnitPrice: 17.4, customerAskUnitPrice: 17.4, deliveryHours: 24 })),
      // Any figure it states must come from an offer verified in this same turn.
      calls(tool("prepare_verified_offer", { sku: "CAP-001", quantity: 50, netUnitPrice: 17.73, deliveryHours: 24 })),
      say("Mi mejor precio hoy es $17.73 por unidad. ¿Le funciona para cerrarlo?"),
    ];
    await runAgentTurn(conversationId, "Déjemelo a 17.40 y cerramos.");
    expect((await toolResults("prepare_verified_offer")).at(-2)).toMatchObject({ status: "unavailable", reason: "price_beyond_autonomy", recommendedNetUnitPrice: 17.58 });
  });
});

describe("confirmation: a 'Sí' to '¿Confirma el pedido?' creates the order, once", () => {
  it("creates the order at the negotiated price, sends the payment link and tells the owner", async () => {
    await negotiate();
    await confirmWithSi();

    expect(await orders()).toEqual([{ total: "886.5", discount_pct: "4.1622", status: "pendiente_pago" }]);
    const messages = await agentMessages();
    expect(messages.at(-2)).toMatch(/pedido quedó registrado/);
    expect(messages.at(-1)).toMatch(/^Su pedido #[A-Z0-9]{8} de \$886\.50 quedó registrado con crédito a 30 días, con vencimiento el/);
    expect(messages.at(-1)).toMatch(/Pagar pedido: https:\/\/demo\.test\/pagar\/[A-Za-z0-9_-]{32}$/);
    expect(h.telegram.at(-1)!.text).toContain("🧾 Pedido confirmado — Distribuidora Belleza del Istmo");
    expect(h.telegram.at(-1)!.text).toContain("50 × Shampoo Professional 1L a $17.73 c/u");
  });

  it("does not take a bare 'Si' as a confirmation when no confirmation was asked", async () => {
    await negotiate();
    h.script = [
      calls(tool("create_sandbox_order", { items: [{ sku: "CAP-001", quantity: 50 }], netUnitPrice: 17.73, creditTerms: "30 días", deliveryHours: 24 })),
      say("Perfecto. ¿Quiere que deje listas las 50 unidades en las condiciones que conversamos?"),
    ];
    await database.query("insert into agente_comercial.messages (conversation_id, direction, sender, body) values ($1,'outbound','agent','¿Qué día le conviene la entrega?')", [conversationId]);
    await runAgentTurn(conversationId, "Si");
    expect(await orders()).toEqual([]);
  });

  it("rewrites a reply that re-presents the same offer instead of moving forward", async () => {
    await negotiate();
    h.script = [
      calls(tool("prepare_verified_offer", { sku: "CAP-001", quantity: 50, netUnitPrice: 17.73, deliveryHours: 24 })),
      say(OFFER_1773),
      say("Con gusto. ¿Le parece si lo dejamos así y lo ingreso ahora?"),
    ];
    await runAgentTurn(conversationId, "Mucho mejor");
    expect((await agentMessages()).at(-1)).toBe("Con gusto. ¿Le parece si lo dejamos así y lo ingreso ahora?");
    const { rows } = await database.query<{ label: string }>("select label from agente_comercial.audit_log where label like 'Respuesta repetida%'");
    expect(rows).toHaveLength(1);
  });
});

describe("payment collection without a human", () => {
  async function orderAndToken() {
    await negotiate();
    await confirmWithSi();
    return tokenFrom((await agentMessages()).at(-1)!);
  }

  it("marks the order paid once, thanks the customer and tells the owner", async () => {
    const token = await orderAndToken();
    expect(await findPayment(token)).toMatchObject({ status: "pendiente_pago", total: 886.5, terms: "30 días" });

    await expect(markPaymentReceived(token, "yappy")).resolves.toEqual({ alreadyPaid: false });
    await expect(markPaymentReceived(token, "yappy")).resolves.toEqual({ alreadyPaid: true });

    expect((await orders())[0].status).toBe("pagado");
    const payments = (await agentMessages()).filter((m) => m.startsWith("Recibimos su pago"));
    expect(payments).toEqual(["Recibimos su pago de $886.50 del pedido #" + (await findPayment(token))!.orderShort + " (Yappy, pago de prueba). ¡Muchas gracias! Coordinamos la entrega de 50 unidades de Shampoo Professional 1L."]);
    expect(h.telegram.filter((m) => m.text.startsWith("💰 Pago recibido"))).toHaveLength(1);
  });

  it("sends a payment problem to the owner, and the owner's answer reaches the customer", async () => {
    const token = await orderAndToken();
    await reportPaymentIssue(token, "Prefiero pagar con cheque a 45 días");

    const question = h.telegram.at(-1)!;
    expect(question.text).toContain("«Prefiero pagar con cheque a 45 días»");
    expect(question.markup).toMatchObject({ force_reply: true });
    expect((await agentMessages()).at(-1)).toBe("Gracias por avisarme. Lo reviso con Abdiel y le escribo en breve para resolverlo.");

    h.script = [say("Ya lo consulté con Abdiel: podemos recibir su cheque, pero el plazo se mantiene en 30 días. ¿Le funciona así?")];
    await handleTelegramUpdate({
      update_id: 1, message: { message_id: 9, chat: { id: 555001 }, from: { id: 555001 }, text: "Cheque sí, pero a 30 días", reply_to_message: { message_id: question.messageId } },
    });
    expect((await agentMessages()).at(-1)).toMatch(/^Ya lo consulté con Abdiel/);
  });

  it("keeps the closed sale reachable while payment is pending, and can resend the link", async () => {
    const token = await orderAndToken();
    expect(await findPendingPaymentConversationByPhone("50766013325")).toBe(conversationId);

    h.instructions = [];
    h.script = [calls(tool("resend_payment_link")), say("Listo, se lo acabo de reenviar.")];
    await runAgentTurn(conversationId, "No encuentro el enlace, ¿me lo reenvía?");

    expect(h.instructions[0]).toContain("Estado del pedido: El pedido #");
    const links = (await agentMessages()).filter((m) => m.includes("/pagar/"));
    expect(links).toHaveLength(2);
    expect(tokenFrom(links[1])).toBe(token);

    await markPaymentReceived(token, "tarjeta");
    expect(await findPendingPaymentConversationByPhone("50766013325")).toBeNull();
  });

  it("does not build a link to an unusable EasyPanel placeholder URL", () => {
    vi.stubEnv("PUBLIC_BASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://$(PRIMARY_DOMAIN)");
    expect(publicBaseUrl()).toBeNull();
  });
});
