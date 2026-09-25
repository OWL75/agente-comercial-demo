import { readFile } from "node:fs/promises";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Owner-in-the-loop over Telegram, end to end: the real runtime, tools,
 * policy engine and SQL (PostgreSQL/WASM) with a scripted model and a fake
 * Telegram API. Covers the real "Déjame validar…" dead end of 2026-09-24.
 */

type Step = { calls: Array<[string, Record<string, unknown>]> } | { say: string };

const h = vi.hoisted(() => ({
  script: [] as Array<{ calls: Array<[string, Record<string, unknown>]> } | { say: string }>,
  telegram: [] as Array<{ chatId: number | string; text: string; markup?: Record<string, unknown>; messageId: number }>,
  answers: [] as Array<string | undefined>,
  closed: [] as number[],
  nextMessageId: 100,
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
}));
vi.mock("@/lib/channel/telegram-client", () => ({
  isTelegramConfigured: () => true,
  sendTelegramMessage: async (chatId: number | string, text: string, markup?: Record<string, unknown>) => {
    const messageId = ++h.nextMessageId;
    h.telegram.push({ chatId, text, markup, messageId });
    return { messageId };
  },
  answerTelegramCallback: async (_id: string, text?: string) => { h.answers.push(text); },
  closeTelegramButtons: async (chatId: number | string, messageId: number, note: string) => {
    h.closed.push(messageId);
    h.telegram.push({ chatId, text: note, messageId: ++h.nextMessageId });
  },
}));
vi.mock("@/lib/agent/openai-client", () => ({
  getAgentModel: () => "scripted-model",
  getOpenAiClient: () => ({
    responses: {
      create: async () => {
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
import { ownerChatId } from "@/lib/agent/owner-notify";
import { guardedFallback } from "@/lib/agent/commercial-reply-guard";

const customerId = "11111111-1111-1111-1111-111111111111";
const conversationId = "22222222-2222-2222-2222-222222222222";
const opportunityId = "33333333-3333-3333-3333-333333333333";
const SKU = "CAP-001";
const OWNER = 555001;
const STRANGER = 777002;
const policy = {
  discount: { autoMaxPct: 5, approvalMaxPct: 10 },
  credit: { existingConditionAuto: true, increaseRequiresApproval: true },
  delivery: { standardHours: 48, expressHours: 24, expressRequiresEligibleStock: true, extraordinaryRequiresApproval: true },
  stock: { neverConfirmWithoutCheck: true },
};

const calls = (...list: Array<[string, Record<string, unknown>]>): Step => ({ calls: list });
const say = (text: string): Step => ({ say: text });
const tool = (name: string, args: Record<string, unknown> = {}): [string, Record<string, unknown>] => [name, args];

let updateId = 1;
const message = (chatId: number, fields: Record<string, unknown>) =>
  handleTelegramUpdate({ update_id: updateId++, message: { message_id: updateId, chat: { id: chatId }, from: { id: chatId }, ...fields } });
const tap = (chatId: number, data: string, messageId = 1) =>
  handleTelegramUpdate({ update_id: updateId++, callback_query: { id: `cb${updateId}`, from: { id: chatId }, data, message: { message_id: messageId, chat: { id: chatId } } } });

const agentMessages = async () =>
  (await database.query<{ body: string }>("select body from agente_comercial.messages where sender='agent' order by created_at")).rows.map((r) => r.body);
const approvals = async () =>
  (await database.query<{ id: string; status: string; decided_by: string | null; decided_value: unknown }>("select id, status, decided_by, decided_value from agente_comercial.approvals")).rows;

async function pairOwner() {
  await message(OWNER, { contact: { phone_number: "+507 6459-7107", user_id: OWNER } });
  expect(await ownerChatId()).toBe(String(OWNER));
  h.telegram = [];
}

beforeAll(async () => {
  await database.exec(await readFile(new URL("./fixtures/demo-schema.sql", import.meta.url), "utf8"));
}, 30000);
beforeEach(async () => {
  vi.stubEnv("TELEGRAM_OWNER_PHONE", "+50764597107");
  h.script = []; h.telegram = []; h.answers = []; h.closed = [];
  await database.exec("truncate agente_comercial.customers, agente_comercial.products, agente_comercial.commercial_policies, agente_comercial.audit_log cascade");
  await database.query(
    "insert into agente_comercial.customers (id, name, credit_total, credit_available, payment_terms) values ($1, 'Distribuidora Belleza del Istmo', 15000, 12000, '30 días')",
    [customerId]);
  await database.query("insert into agente_comercial.opportunities (id, customer_id, status) values ($1, $2, 'conversando')", [opportunityId, customerId]);
  await database.query("insert into agente_comercial.conversations (id, customer_id, opportunity_id, stage) values ($1, $2, $3, 'objection_handling')",
    [conversationId, customerId, opportunityId]);
  await database.exec("insert into agente_comercial.products (sku,name,unit_price,stock,express_eligible) values ('CAP-001','Shampoo Professional 1L',18.50,820,true)");
  await database.query("insert into agente_comercial.commercial_policies (version,config) values (1,$1)", [JSON.stringify(policy)]);
});
afterEach(() => { vi.unstubAllEnvs(); });
afterAll(async () => { await database.close(); });

const REAL_MESSAGE = "El proveedor actual nos deja el shampoo cerca de $17.75 y entrega al día siguiente.";

describe("owner pairing", () => {
  it("pairs only the Telegram account whose own verified number is the owner's", async () => {
    await message(STRANGER, { text: "/start" });
    expect(h.telegram.at(-1)!.markup).toMatchObject({ keyboard: [[{ request_contact: true }]] });

    await message(STRANGER, { contact: { phone_number: "+50764597107", user_id: OWNER } }); // someone else's card
    await message(STRANGER, { contact: { phone_number: "+50760000000", user_id: STRANGER } }); // wrong number
    expect(await ownerChatId()).toBeNull();

    await pairOwner();
  });
});

describe("the real dead end: 'Déjame validar…' never came back", () => {
  it("verifies and answers in the same turn instead of promising to validate", async () => {
    h.script = [
      say("Podemos dejártelo en $17.75 con entrega al día siguiente."), // unverified: blocked
      calls(tool("prepare_verified_offer", { sku: SKU, quantity: 50, discountPct: 4, deliveryHours: 24 })),
      say("Revisé con tu volumen habitual de 50 unidades: te queda en $17.76 por unidad con 4%, total $888.00, con entrega en 24 horas y tu crédito de 30 días. ¿Confirmas el pedido?"),
    ];
    await runAgentTurn(conversationId, REAL_MESSAGE);

    const sent = (await agentMessages()).at(-1)!;
    expect(sent).toContain("$17.76");
    expect(sent).not.toMatch(/Déjame validar/);
    expect(h.telegram).toEqual([]);
    expect(h.script).toHaveLength(0);
  });

  it("when it still can't verify, asks the owner and writes to the customer as soon as the owner answers", async () => {
    await pairOwner();
    h.script = [say("Te lo dejo en $17.50."), say("Te lo dejo en $17.50.")];
    await runAgentTurn(conversationId, REAL_MESSAGE);

    expect((await agentMessages()).at(-1)).toBe(guardedFallback(false, true));
    const question = h.telegram.at(-1)!;
    expect(question.chatId).toBe(String(OWNER));
    expect(question.text).toContain(REAL_MESSAGE);
    expect(question.markup).toMatchObject({ force_reply: true });

    h.script = [
      calls(tool("prepare_verified_offer", { sku: SKU, quantity: 50, discountPct: 4, deliveryHours: 24 })),
      say("Ya lo consulté: con tu volumen habitual de 50 unidades te queda en $17.76 por unidad con 4%, total $888.00, con entrega en 24 horas. ¿Confirmas el pedido?"),
    ];
    await message(OWNER, { text: "Ofrécele 4% y entrega express, vale la pena recuperarlo", reply_to_message: { message_id: question.messageId } });

    const followUp = (await agentMessages()).at(-1)!;
    expect(followUp).toMatch(/^Ya lo consulté/);
    expect(h.telegram.at(-1)!.text).toContain("Ya le escribí al cliente");
    expect(h.telegram.at(-1)!.text).toContain("$17.76");
  });
});

describe("approvals decided from Telegram", () => {
  const eightPercentTurn = (reply = "Lo estoy consultando con mi gerente y te escribo en breve.") => [
    calls(
      tool("prepare_verified_offer", { sku: SKU, quantity: 200, discountPct: 8, deliveryHours: 48 }),
      tool("request_approval", { type: "discount", productSku: SKU, quantity: 200, requestedPct: 8, reason: "Volumen alto", agentRecommendation: "Aprobar 8%" }),
    ),
    say(reply),
  ];
  const approvedOffer = () => [
    calls(tool("prepare_verified_offer", { sku: SKU, quantity: 200, discountPct: 8, deliveryHours: 48 }), tool("update_opportunity_stage", { stage: "closing" })),
    say("Ya lo consulté y quedó aprobado: 200 unidades a $17.02 por unidad con 8%, total $3404.00 y entrega estándar. ¿Confirmas las 200 unidades?"),
  ];

  it("sends the case with buttons and, on approve, writes the verified offer to the customer on its own", async () => {
    await pairOwner();
    h.script = eightPercentTurn();
    await runAgentTurn(conversationId, "Te compro 200 del Shampoo Professional si me das 8%.");

    const request = h.telegram.at(-1)!;
    expect(request.text).toContain("Pide: 8% de descuento en 200 × Shampoo Professional 1L");
    expect(request.text).toContain("$17.02 c/u · total $3,404.00");
    const [approval] = await approvals();
    expect(request.markup).toMatchObject({ inline_keyboard: [[{ callback_data: `ap:${approval.id}:8` }, { callback_data: `rj:${approval.id}` }], [{ callback_data: `mv:${approval.id}` }]] });

    h.script = approvedOffer();
    await tap(OWNER, `ap:${approval.id}:8`, request.messageId);

    expect(await approvals()).toEqual([expect.objectContaining({ status: "approved", decided_by: "Dueño (Telegram)", decided_value: { pct: 8 } })]);
    expect((await agentMessages()).at(-1)).toMatch(/^Ya lo consulté y quedó aprobado/);
    expect(h.closed).toEqual([request.messageId]);
    expect(h.telegram.at(-1)!.text).toMatch(/Aprobado 8% para Distribuidora Belleza del Istmo\. Ya le escribí al cliente/);
    expect((await database.query("select id from agente_comercial.orders")).rows).toHaveLength(0);
  });

  it("does not message the owner twice when the same request is filed again", async () => {
    await pairOwner();
    h.script = [...eightPercentTurn(), ...eightPercentTurn("Perfecto, ya quedó en revisión; le aviso apenas tenga la respuesta.")];
    await runAgentTurn(conversationId, "Te compro 200 si me das 8%.");
    await runAgentTurn(conversationId, "Sí, es en firme el 8%.");
    expect(h.telegram.filter((m) => m.text.startsWith("Necesito tu OK"))).toHaveLength(1);
  });

  it("lets the owner approve a different value by replying with a number", async () => {
    await pairOwner();
    h.script = eightPercentTurn();
    await runAgentTurn(conversationId, "Te compro 200 si me das 8%.");
    const [approval] = await approvals();

    await tap(OWNER, `mv:${approval.id}`);
    const prompt = h.telegram.at(-1)!;
    expect(prompt.text).toContain("máximo 10%");

    h.script = [say("Ya lo consulté: puedo ofrecerte 7% para las 200 unidades. ¿Te sirve así?")];
    await message(OWNER, { text: "7", reply_to_message: { message_id: prompt.messageId } });
    expect(await approvals()).toEqual([expect.objectContaining({ status: "modified", decided_value: { pct: 7 } })]);
  });

  it("refuses an out-of-policy value and tells the owner why", async () => {
    await pairOwner();
    h.script = eightPercentTurn();
    await runAgentTurn(conversationId, "Te compro 200 si me das 8%.");
    const [approval] = await approvals();
    await tap(OWNER, `mv:${approval.id}`);
    await message(OWNER, { text: "15", reply_to_message: { message_id: h.telegram.at(-1)!.messageId } });

    expect((await approvals())[0].status).toBe("pending");
    expect(h.telegram.at(-1)!.text).toContain("No pude aplicar tu decisión: Descuento fuera de la política vigente.");
  });

  it("ignores stale buttons, strangers and repeated deliveries", async () => {
    await pairOwner();
    h.script = eightPercentTurn();
    await runAgentTurn(conversationId, "Te compro 200 si me das 8%.");
    const [approval] = await approvals();

    await tap(STRANGER, `ap:${approval.id}:8`);
    await tap(OWNER, `ap:${approval.id}:9`);
    expect(h.answers.at(-1)).toContain("La solicitud cambió");
    expect((await approvals())[0].status).toBe("pending");

    h.script = [say("Ya lo consulté: no podemos dar ese 8%, pero te mantengo el precio de lista con entrega estándar. ¿Te sirve?")];
    const update = { update_id: 9999, callback_query: { id: "cb-dup", from: { id: OWNER }, data: `rj:${approval.id}`, message: { message_id: 1, chat: { id: OWNER } } } };
    await handleTelegramUpdate(update);
    await handleTelegramUpdate(update);
    expect(await approvals()).toEqual([expect.objectContaining({ status: "rejected", decided_by: "Dueño (Telegram)" })]);
    expect(h.script).toHaveLength(0);
  });

  it("keeps working from the panel alone when Telegram is not paired", async () => {
    h.script = eightPercentTurn();
    await runAgentTurn(conversationId, "Te compro 200 si me das 8%.");
    expect(h.telegram).toEqual([]);
    const { rows } = await database.query<{ label: string }>("select label from agente_comercial.audit_log where label like 'Aprobación pendiente:%'");
    expect(rows[0].label).toContain("queda solo en el panel");
  });
});
