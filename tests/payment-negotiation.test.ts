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
  whatsappOn: false,
  whatsapp: [] as Array<{ kind: string; args: unknown[] }>,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => {
  const { sql } = await import("./sql-harness");
  return { sql, toJsonb: sql.json };
});
vi.mock("@/lib/channel/whatsapp-client", () => ({
  isWhatsAppConfigured: () => h.whatsappOn,
  sendWhatsAppMessage: async (...args: unknown[]) => { h.whatsapp.push({ kind: "text", args }); return { messageId: null }; },
  sendWhatsAppLinkButton: async (...args: unknown[]) => { h.whatsapp.push({ kind: "link", args }); return { messageId: null }; },
  sendWhatsAppTemplate: async (...args: unknown[]) => { h.whatsapp.push({ kind: "template", args }); return { messageId: null }; },
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
import {
  findPayment,
  getPaymentReminderState,
  markPaymentReceived,
  publicBaseUrl,
  reportPaymentIssue,
  runDuePaymentReminders,
  simulateNextPaymentReminder,
} from "@/lib/payments/payments";
import { addDays } from "@/lib/payments/payment-messages";
import { todayInPanama } from "@/lib/agent/system-prompt";
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
const OFFER_1770 = "Perfecto, se lo dejo en $17.70 por unidad: 50 unidades, total $885.00, entrega en 24 horas y crédito a 30 días. ¿Confirma el pedido en estas condiciones?";

/** Customer compares with $17.75 → agent offers $17.76; customer asks $17.70 → within margin, accepted as is. */
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
    calls(tool("prepare_verified_offer", { sku: "CAP-001", quantity: 50, netUnitPrice: 17.7, customerAskUnitPrice: 17.7, deliveryHours: 24 })),
    say(OFFER_1770),
  ];
  await runAgentTurn(conversationId, "¿Me lo puede dejar a 17.70?");
}

async function confirmWithSi() {
  h.script = [
    calls(tool("create_sandbox_order", { items: [{ sku: "CAP-001", quantity: 50 }], netUnitPrice: 17.7, creditTerms: "30 días", deliveryHours: 24 })),
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
  h.script = []; h.instructions = []; h.telegram = []; h.whatsapp = []; h.whatsappOn = false;
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
  it("accepts $17.70 as is when it is within the margin, and refuses the jump to $17.58", async () => {
    await negotiate();
    const [first, jump, accepted] = await toolResults("prepare_verified_offer");
    expect(first).toMatchObject({ status: "ready", netUnitPrice: 17.76, total: 888 });
    expect(jump).toMatchObject({
      status: "unavailable", reason: "below_customer_ask", netUnitPrice: 17.58, recommendedNetUnitPrice: 17.7,
      negotiation: { customerAskUnitPrice: 17.7, lastOfferedUnitPrice: 17.76, autonomyFloorUnitPrice: 17.58, askWithinAutonomy: true, recommendedUnitPrice: 17.7 },
    });
    expect(accepted).toMatchObject({ status: "ready", netUnitPrice: 17.7, total: 885, discountPct: 4.3243 });
    expect((await agentMessages()).at(-1)).toBe(OFFER_1770);
  });

  it("answers $17.50 with its best price (5% → $17.58), and asks the owner only when the customer insists", async () => {
    await negotiate();
    h.script = [
      calls(tool("save_customer_insight", { precioObjetivo: 17.5 }),
        tool("prepare_verified_offer", { sku: "CAP-001", quantity: 50, netUnitPrice: 17.5, customerAskUnitPrice: 17.5, deliveryHours: 24 })),
      calls(tool("prepare_verified_offer", { sku: "CAP-001", quantity: 50, discountPct: 5, customerAskUnitPrice: 17.5, deliveryHours: 24 })),
      say("Entiendo. Lo máximo que puedo rebajarle es un 5%: quedaría en $17.58 por unidad, total $879.00, con entrega en 24 horas. ¿Le funciona?"),
    ];
    await runAgentTurn(conversationId, "No, déjamelo a 17.50.");
    const [probe, best] = (await toolResults("prepare_verified_offer")).slice(-2);
    expect(probe).toMatchObject({
      status: "approval_required", approvalsNeeded: ["discount"], reason: "below_autonomy_floor", recommendedNetUnitPrice: 17.58,
      negotiation: { askWithinAutonomy: false, recommendedUnitPrice: 17.58 },
    });
    expect(best).toMatchObject({ status: "ready", netUnitPrice: 17.58, total: 879, discountPct: 5 });
    expect((await database.query("select id from agente_comercial.approvals")).rows).toEqual([]);

    // The customer insists: now the owner decides the exact $17.50.
    h.script = [
      calls(tool("prepare_verified_offer", { sku: "CAP-001", quantity: 50, netUnitPrice: 17.5, customerAskUnitPrice: 17.5, deliveryHours: 24 })),
      calls(tool("request_approval", { type: "discount", productSku: "CAP-001", quantity: 50, requestedPct: 5.4054, reason: "Insiste en $17.50 para cerrar 50 unidades", agentRecommendation: "Aprobar: recupera al cliente" })),
      say("Entiendo. Lo consulto con Abdiel y le escribo en unos minutos."),
    ];
    await runAgentTurn(conversationId, "Si no es a 17.50 no te compro.");
    const request = h.telegram.at(-1)!;
    expect(request.text).toContain("Pide: 5.41% de descuento en 50 × Shampoo Professional 1L");
    expect(request.text).toContain("$18.50 → $17.50 c/u · total $875.00");
    const { rows: [approval] } = await database.query<{ id: string }>("select id from agente_comercial.approvals");

    h.script = [
      calls(tool("prepare_verified_offer", { sku: "CAP-001", quantity: 50, netUnitPrice: 17.5, customerAskUnitPrice: 17.5, deliveryHours: 24 })),
      say("Ya lo consulté: se lo dejo en $17.50 por unidad, total $875.00, con entrega en 24 horas y crédito a 30 días. ¿Confirma el pedido en estas condiciones?"),
    ];
    await handleTelegramUpdate({
      update_id: 77, callback_query: { id: "cb", from: { id: 555001 }, data: `ap:${approval.id}:5.4054`, message: { message_id: request.messageId, chat: { id: 555001 } } },
    });
    expect((await agentMessages()).at(-1)).toMatch(/^Ya lo consulté: se lo dejo en \$17\.50/);

    h.script = [
      calls(tool("create_sandbox_order", { items: [{ sku: "CAP-001", quantity: 50 }], netUnitPrice: 17.5, creditTerms: "30 días", deliveryHours: 24 })),
      say("¡Listo! Pedido registrado; en el siguiente mensaje le envío cómo pagarlo."),
    ];
    await runAgentTurn(conversationId, "Si");
    expect(await orders()).toEqual([{ total: "875", discount_pct: "5.4054", status: "pendiente_pago" }]);
  });
});

describe("confirmation: a 'Sí' to '¿Confirma el pedido?' creates the order, once", () => {
  it("creates the order at the negotiated price, sends the payment link and tells the owner", async () => {
    await negotiate();
    await confirmWithSi();

    expect(await orders()).toEqual([{ total: "885", discount_pct: "4.3243", status: "pendiente_pago" }]);
    const messages = await agentMessages();
    expect(messages.at(-2)).toMatch(/pedido quedó registrado/);
    expect(messages.at(-1)).toMatch(/^Su pedido #[A-Z0-9]{8} de \$885\.00 quedó registrado con crédito a 30 días, con vencimiento el/);
    expect(messages.at(-1)).toMatch(/Pagar pedido: https:\/\/demo\.test\/pagar\/[A-Za-z0-9_-]{32}$/);
    expect(h.telegram.at(-1)!.text).toContain("🧾 Pedido confirmado — Distribuidora Belleza del Istmo");
    expect(h.telegram.at(-1)!.text).toContain("50 × Shampoo Professional 1L a $17.70 c/u");
  });

  it("does not take a bare 'Si' as a confirmation when no confirmation was asked", async () => {
    await negotiate();
    h.script = [
      calls(tool("create_sandbox_order", { items: [{ sku: "CAP-001", quantity: 50 }], netUnitPrice: 17.7, creditTerms: "30 días", deliveryHours: 24 })),
      say("Perfecto. ¿Quiere que deje listas las 50 unidades en las condiciones que conversamos?"),
    ];
    await database.query("insert into agente_comercial.messages (conversation_id, direction, sender, body) values ($1,'outbound','agent','¿Qué día le conviene la entrega?')", [conversationId]);
    await runAgentTurn(conversationId, "Si");
    expect(await orders()).toEqual([]);
  });

  it("rewrites a reply that re-presents the same offer instead of moving forward", async () => {
    await negotiate();
    h.script = [
      calls(tool("prepare_verified_offer", { sku: "CAP-001", quantity: 50, netUnitPrice: 17.7, deliveryHours: 24 })),
      say(OFFER_1770),
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
    expect(await findPayment(token)).toMatchObject({ status: "pendiente_pago", total: 885, terms: "30 días" });

    await expect(markPaymentReceived(token, "yappy")).resolves.toEqual({ alreadyPaid: false });
    await expect(markPaymentReceived(token, "yappy")).resolves.toEqual({ alreadyPaid: true });

    expect((await orders())[0].status).toBe("pagado");
    const payments = (await agentMessages()).filter((m) => m.startsWith("Recibimos su pago"));
    expect(payments).toEqual(["Recibimos su pago de $885.00 del pedido #" + (await findPayment(token))!.orderShort + ". ¡Muchas gracias! Coordinamos la entrega de 50 unidades de Shampoo Professional 1L."]);
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

describe("due-date reminders", () => {
  async function creditOrder() {
    await negotiate();
    await confirmWithSi();
  }
  const labels = async () =>
    (await database.query<{ label: string }>("select label from agente_comercial.audit_log where label like 'Recordatorio de pago enviado%' order by created_at")).rows.map((r) => r.label);

  it("demo: simulates the three reminders in order; only the overdue one alerts the owner", async () => {
    await creditOrder();
    const state = await getPaymentReminderState(conversationId);
    expect(state).toMatchObject({ dueDate: addDays(todayInPanama(), 30), sentCount: 0, canSimulate: true });

    for (let i = 0; i < 3; i++) await simulateNextPaymentReminder(conversationId);

    const reminders = (await agentMessages()).slice(-3);
    expect(reminders[0]).toMatch(/^Hola, le recordamos que el pago de su pedido #[A-Z0-9]{8} por \$885\.00 vence el/);
    expect(reminders[1]).toMatch(/^Hola, hoy vence el pago de su pedido/);
    expect(reminders[2]).toMatch(/^Hola, el pago de su pedido .* venció el/);
    for (const r of reminders) expect(r).toMatch(/Pagar pedido: https:\/\/demo\.test\/pagar\//);
    expect(await labels()).toEqual([
      "Recordatorio de pago enviado: 1 de 3 — Recordatorio antes del vencimiento (simulado; en producción: 3 días antes del vencimiento)",
      "Recordatorio de pago enviado: 2 de 3 — Vence hoy (simulado; en producción: el día del vencimiento)",
      "Recordatorio de pago enviado: 3 de 3 — Pago vencido (simulado; en producción: 3 días después del vencimiento)",
    ]);
    expect(h.telegram.filter((m) => m.text.startsWith("⚠️ Pago vencido"))).toHaveLength(1);

    await simulateNextPaymentReminder(conversationId);
    expect(await labels()).toHaveLength(3);
    expect((await getPaymentReminderState(conversationId))?.blockedReason).toMatch(/Ya se enviaron todos/);
  });

  it("stops reminding once the customer pays", async () => {
    await creditOrder();
    await simulateNextPaymentReminder(conversationId);
    const { token } = (await getPaymentReminderState(conversationId))!;
    await markPaymentReceived(token, "transferencia");
    await simulateNextPaymentReminder(conversationId);
    expect(await labels()).toHaveLength(1);
    expect((await getPaymentReminderState(conversationId))?.blockedReason).toMatch(/ya pagó/);
    expect(await runDuePaymentReminders(addDays(todayInPanama(), 60))).toBe(0);
  });

  it("production runner: sends each reminder when its date arrives, one per run", async () => {
    await creditOrder();
    const due = addDays(todayInPanama(), 30);
    expect(await runDuePaymentReminders(todayInPanama())).toBe(0);
    expect(await runDuePaymentReminders(addDays(due, -3))).toBe(1);
    expect(await runDuePaymentReminders(addDays(due, -3))).toBe(0);
    expect(await runDuePaymentReminders(due)).toBe(1);
    expect(await runDuePaymentReminders(addDays(due, 3))).toBe(1);
    expect(await runDuePaymentReminders(addDays(due, 30))).toBe(0);
    expect((await labels()).every((l) => !l.includes("simulado"))).toBe(true);
    expect(await labels()).toHaveLength(3);
  });

  it("production (meta mode): payment messages go out as approved templates with the token in the button", async () => {
    vi.stubEnv("WHATSAPP_TEMPLATE_MODE", "meta");
    h.whatsappOn = true;
    await creditOrder();
    await simulateNextPaymentReminder(conversationId);
    const templates = h.whatsapp.filter((w) => w.kind === "template").map((w) => w.args);
    const { token } = (await getPaymentReminderState(conversationId))!;
    expect(templates).toEqual([
      ["+507 6601-3325", "cobro_credito", "es", [expect.stringMatching(/^[A-Z0-9]{8}$/), "$885.00", "30 días", expect.any(String)], token],
      ["+507 6601-3325", "recordatorio_pago", "es", [expect.any(String), "$885.00", expect.any(String)], token],
    ]);
  });

  it("demo mode: the same copy goes out as a 'Pagar pedido' link button with the template footer", async () => {
    h.whatsappOn = true;
    await creditOrder();
    const links = h.whatsapp.filter((w) => w.kind === "link").map((w) => w.args);
    expect(links).toEqual([[
      "+507 6601-3325", expect.stringMatching(/^Su pedido #/), "Pagar pedido", expect.stringMatching(/^https:\/\/demo\.test\/pagar\//),
      "Si necesita pagar de otra forma, respóndame aquí.",
    ]]);
  });
});

describe("real conversation 2026-09-24 16:10 UTC: natural replies", () => {
  const REAL_DRAFT = "Entiendo; un mejor precio y entrega al día siguiente pesan mucho en la recompra. ¿A qué precio por unidad y para qué cantidad lo está comprando actualmente?";
  const rewrites = async () =>
    (await database.query<{ label: string }>("select label from agente_comercial.audit_log where label like 'Respuesta con condiciones sin verificar%'")).rows;

  it("sends the discovery question as written instead of forcing a list-price offer", async () => {
    h.script = [say(REAL_DRAFT)];
    await runAgentTurn(conversationId, "El precio es mejor y la entrega inmediata al día siguiente");
    expect((await agentMessages()).at(-1)).toBe(REAL_DRAFT);
    expect(await rewrites()).toEqual([]);
    expect(h.script).toHaveLength(0);
  });

  it("never shows 'Descuento: 0%' to the customer", async () => {
    h.script = [
      calls(tool("prepare_verified_offer", { sku: "CAP-001", quantity: 50, discountPct: 0, deliveryHours: 24 })),
      say("Le puedo ofrecer:\n\n- 50 unidades de Shampoo Professional 1L\n- Precio: *$18.50 por unidad*\n- Total: *$925.00*\n- Descuento: 0%\n- Entrega: *24 horas*\n- Pago: crédito a *30 días*\n\n¿Confirma el pedido en estas condiciones?"),
    ];
    await runAgentTurn(conversationId, "¿Cuánto me sale el pedido de siempre con entrega en 24 horas?");
    const sent = (await agentMessages()).at(-1)!;
    expect(sent).not.toMatch(/0\s*%|Descuento/);
    expect(sent).toContain("- Total: *$925.00*\n- Entrega: *24 horas*");
  });
});

describe("real conversation 2026-09-24 16:38 UTC: '¿No tienes un mejor precio?'", () => {
  const BEAT_1765 = "Le puedo dejar el Shampoo Professional 1L en $17.65 por unidad, por debajo de lo que paga hoy: 50 unidades, total $882.50, con entrega al día siguiente y crédito a 30 días. ¿Me confirma el pedido?";

  /** First offer against the competitor's $17.75: $17.65 (see the 01:44 case below). */
  async function beatCompetitor() {
    h.script = [
      calls(
        tool("save_customer_insight", { productoInteres: "Shampoo Professional 1L", cantidad: 50, precioObjetivo: 17.75, competidorMencionado: "Otro proveedor" }),
        tool("prepare_verified_offer", { sku: "CAP-001", quantity: 50, netUnitPrice: 17.65, deliveryHours: 24 }),
      ),
      say(BEAT_1765),
    ];
    await runAgentTurn(conversationId, "17.75");
  }

  it("the competitor's price is a reference, not a floor: the first offer is $17.65, with the saving", async () => {
    await beatCompetitor();
    expect((await toolResults("prepare_verified_offer")).at(-1)).toMatchObject({
      status: "ready", netUnitPrice: 17.65, total: 882.5,
      negotiation: {
        referenceUnitPrice: 17.75, lastOfferedUnitPrice: null, customerAskUnitPrice: null,
        recommendedUnitPrice: 17.65, recommendationBasis: "beat_reference", savingsVsReference: { perUnit: 0.1, total: 5 },
      },
    });
    expect((await agentMessages()).at(-1)).toBe(BEAT_1765);
  });

  it("if the customer asks again, the tool points to the best price ($17.58), and below that to the owner", async () => {
    await beatCompetitor();
    h.script = [
      calls(tool("prepare_verified_offer", { sku: "CAP-001", quantity: 50, netUnitPrice: 17.58, deliveryHours: 24 })),
      say("Mi mejor precio es $17.58 por unidad: 50 unidades, total $879.00, con entrega al día siguiente. ¿Me confirma el pedido?"),
    ];
    await runAgentTurn(conversationId, "Algo más?");
    const [step2] = (await toolResults("prepare_verified_offer")).slice(-1);
    expect(step2).toMatchObject({ status: "ready", netUnitPrice: 17.58, negotiation: { lastOfferedUnitPrice: 17.65, recommendedUnitPrice: 17.58, recommendationBasis: "floor" } });

    h.script = [
      calls(tool("prepare_verified_offer", { sku: "CAP-001", quantity: 50, netUnitPrice: 17.5, deliveryHours: 24 })),
      say("Ese precio tendría que consultarlo con Abdiel. ¿Quiere que lo consulte?"),
    ];
    await runAgentTurn(conversationId, "Déjamelo en menos");
    expect((await toolResults("prepare_verified_offer")).at(-1)).toMatchObject({
      status: "approval_required", reason: "below_autonomy_floor", negotiation: { recommendationBasis: "at_floor" },
    });
  });
});

describe("real conversation 2026-09-24 16:38 UTC: plain commercial language", () => {
  it("rewrites 'para recuperar su pedido' / 'condiciones verificadas' before sending", async () => {
    h.script = [
      calls(tool("prepare_verified_offer", { sku: "CAP-001", quantity: 50, netUnitPrice: 17.75, deliveryHours: 24 })),
      say("Perfecto, puedo igualar esa condición para recuperar su pedido: 50 unidades a $17.75 por unidad, total $887.50. ¿Me confirma el pedido?"),
      say("Perfecto, le igualo ese precio: 50 unidades a $17.75 por unidad, total $887.50, con entrega al día siguiente. ¿Me confirma el pedido?"),
    ];
    await runAgentTurn(conversationId, "17.75");
    expect((await agentMessages()).at(-1)).toMatch(/^Perfecto, le igualo ese precio/);
  });
});

describe("real conversation 2026-09-24 21:17 UTC: quote directly, don't ask permission", () => {
  it("rewrites '¿le cotizo las 50 unidades?' into an offer that beats the competitor", async () => {
    await database.query("insert into agente_comercial.customer_insights (conversation_id, customer_id, producto_interes, precio_objetivo, opt_out) values ($1, $2, 'Shampoo Professional 1L', 17.75, false)", [conversationId, customerId]);
    const BEAT = "Le puedo dejar el Shampoo Professional 1L en $17.65 por unidad, $5.00 menos que su proveedor en 50 unidades: total $882.50, con entrega al día siguiente y crédito a 30 días. ¿Me confirma el pedido?";
    h.script = [
      say("Gracias, lo tomo como referencia: su proveedor le ofrece el Shampoo Professional 1L a $17.75 por unidad y entrega al día siguiente. Para compararle en esas mismas condiciones, ¿le cotizo las 50 unidades de su último pedido?"),
      calls(tool("prepare_verified_offer", { sku: "CAP-001", quantity: 50, netUnitPrice: 17.65, deliveryHours: 24 })),
      say(BEAT),
    ];
    await runAgentTurn(conversationId, "17.75");
    expect((await agentMessages()).at(-1)).toBe(BEAT);
    expect((await toolResults("prepare_verified_offer")).at(-1)).toMatchObject({
      status: "ready", total: 882.5, negotiation: { referenceUnitPrice: 17.75, recommendedUnitPrice: 17.65, recommendationBasis: "beat_reference" },
    });
    expect(h.script).toHaveLength(0);
  });
});

describe("real conversation 2026-09-25 01:44 UTC: 'me estás ofreciendo lo mismo'", () => {
  const MATCH = "Puedo igualar el precio y la entrega: 50 unidades de Shampoo Professional 1L a $17.75 por unidad, total $887.50, con entrega al día siguiente. ¿Me confirma que lo prepare?";
  const BEAT = "Le puedo dejar el Shampoo Professional 1L en $17.65 por unidad, $5.00 menos que su proveedor en 50 unidades: total $882.50, con entrega al día siguiente. Además su cuenta tiene crédito a 30 días, así que no tiene que pagar por adelantado. ¿Me confirma el pedido?";

  beforeEach(async () => {
    await database.query("insert into agente_comercial.customer_insights (conversation_id, customer_id, producto_interes, precio_objetivo, opt_out) values ($1, $2, 'Shampoo Professional 1L', 17.75, false)", [conversationId, customerId]);
  });

  it("an offer that only matches the competitor is rewritten to beat it and say what the customer gains", async () => {
    h.script = [
      calls(tool("prepare_verified_offer", { sku: "CAP-001", quantity: 50, netUnitPrice: 17.75, deliveryHours: 24 })),
      say(MATCH),
      calls(
        tool("prepare_verified_offer", { sku: "CAP-001", quantity: 50, netUnitPrice: 17.65, deliveryHours: 24 }),
        tool("get_value_proposition"),
      ),
      say(BEAT),
    ];
    await runAgentTurn(conversationId, "Mi proveedor me lo deja a 17.75 con entrega al día siguiente");
    expect(await agentMessages()).toEqual([BEAT]);
    expect(h.script).toHaveLength(0);
    const value = (await toolResults("get_value_proposition")).at(-1) as { customerFacts: string[]; companyAdvantages: string[] };
    expect(value.customerFacts.join(" ")).toMatch(/crédito a 30 días con \$12,000\.00 disponibles/);
    expect(value.companyAdvantages.length).toBeGreaterThan(0);
  });

  it("accepting the customer's own price is not 'matching': $17.75 asked explicitly is taken as is", async () => {
    const ACCEPT = "Perfecto, se lo dejo en $17.75 por unidad: 50 unidades, total $887.50, con entrega al día siguiente. ¿Me confirma el pedido?";
    h.script = [
      calls(tool("prepare_verified_offer", { sku: "CAP-001", quantity: 50, netUnitPrice: 17.75, customerAskUnitPrice: 17.75, deliveryHours: 24 })),
      say(ACCEPT),
    ];
    await runAgentTurn(conversationId, "Déjemelo en 17.75 y le compro");
    expect(await agentMessages()).toEqual([ACCEPT]);
    expect(h.script).toHaveLength(0);
  });

  it("'me ofreces lo mismo' after a matched offer: the next step is $17.65, then $17.58", async () => {
    h.script = [
      calls(tool("prepare_verified_offer", { sku: "CAP-001", quantity: 50, netUnitPrice: 17.65, deliveryHours: 24 })),
      say(BEAT),
    ];
    await runAgentTurn(conversationId, "17.75");
    h.script = [
      calls(tool("prepare_verified_offer", { sku: "CAP-001", quantity: 50, netUnitPrice: 17.58, deliveryHours: 24 })),
      say("Entiendo. Mi mejor precio es $17.58 por unidad: 50 unidades, total $879.00, con entrega al día siguiente y crédito a 30 días. ¿Me confirma el pedido?"),
    ];
    await runAgentTurn(conversationId, "Creo que me estás ofreciendo lo mismo");
    expect((await toolResults("prepare_verified_offer")).at(-1)).toMatchObject({
      status: "ready", netUnitPrice: 17.58, negotiation: { lastOfferedUnitPrice: 17.65, recommendationBasis: "floor", savingsVsReference: { perUnit: 0.17, total: 8.5 } },
    });
  });
});
