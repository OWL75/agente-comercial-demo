import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => {
  const { sql } = await import("./sql-harness");
  return { sql, toJsonb: sql.json };
});
vi.mock("@/lib/agent/runtime", () => ({
  resumeAfterHumanDecision: vi.fn().mockResolvedValue({ reply: "OK" }),
  startConversation: vi.fn().mockResolvedValue({ reply: "Hola" }),
}));

import { database, presentBestPrice } from "./sql-harness";
import { createSandboxOrder } from "@/lib/tools/orders";
import { requestApproval, getApprovalResult } from "@/lib/tools/approvals";
import { saveCustomerInsight } from "@/lib/tools/customer";
import { isCustomerSuppressed, assertContactAllowed } from "@/lib/agent/contact-permission";
import { decideApproval } from "@/lib/agent/approval-decision";
import { updateOpportunityStage } from "@/lib/tools/stage";
import { startConversationForOpportunity } from "@/lib/agent/conversation-lifecycle";
import { getOpenAiToolDefinitions } from "@/lib/agent/tools";
import {
  DEMO_CUSTOMER_ID,
  DEMO_CUSTOMER_NAME,
  DEMO_OPPORTUNITY_ID,
  getDemoScenarioStatus,
  prepareDemoScenario,
} from "@/lib/demo-scenario";

const customerId = "11111111-1111-1111-1111-111111111111";
const conversationId = "22222222-2222-2222-2222-222222222222";
const opportunityId = "33333333-3333-3333-3333-333333333333";
const policy = {
  discount: { autoMaxPct: 5, approvalMaxPct: 10 },
  credit: { existingConditionAuto: true, increaseRequiresApproval: true },
  delivery: { standardHours: 48, expressHours: 24, expressRequiresEligibleStock: true, extraordinaryRequiresApproval: true },
  stock: { neverConfirmWithoutCheck: true },
};
const order = () => ({ customerId, conversationId, items: [{ sku: "CAP-001", quantity: 200 }], discountPct: 0, creditTerms: "30 días", deliveryHours: 48 });
const request = () => ({ customerId, conversationId, type: "discount" as const, productSku: "CAP-001", quantity: 200,
  requestedPct: 8, reason: "Precio", agentRecommendation: "Aprobar" });

async function presentOffer(input = order()) {
  const item = input.items[0];
  await database.query(
    `insert into agente_comercial.audit_log (conversation_id, category, label, payload)
     values ($1, 'policy_check', 'Oferta verificada presentada para confirmación', $2)`,
    [conversationId, JSON.stringify({ offer: {
      status: "ready", sku: item.sku, quantity: item.quantity,
      discountPct: input.discountPct, deliveryHours: input.deliveryHours,
    } })],
  );
}

beforeAll(async () => {
  await database.exec(await readFile(new URL("./fixtures/demo-schema.sql", import.meta.url), "utf8"));
}, 30000);
beforeEach(async () => {
  // Only this in-memory test engine is reachable through the mocked adapter.
  await database.exec("truncate agente_comercial.customers, agente_comercial.products, agente_comercial.commercial_policies cascade");
  await database.query("insert into agente_comercial.customers (id) values ($1)", [customerId]);
  await database.query("insert into agente_comercial.opportunities (id, customer_id) values ($1, $2)", [opportunityId, customerId]);
  await database.query("insert into agente_comercial.conversations (id, customer_id, opportunity_id) values ($1, $2, $3)", [conversationId, customerId, opportunityId]);
  await database.exec("insert into agente_comercial.products (sku,name,unit_price,stock) values ('CAP-001','Shampoo',18.50,820), ('CAP-005','Mascarilla',13.40,280)");
  await database.query("insert into agente_comercial.commercial_policies (version,config) values (1,$1)", [JSON.stringify(policy)]);
  await presentOffer();
});
afterAll(async () => { await database.close(); });

describe("Postgres-backed commercial controls (isolated fixture)", () => {
  it("reuses an existing conversation and blocks reopening a closed opportunity", async () => {
    expect(await startConversationForOpportunity(opportunityId)).toBe(conversationId);
    await createSandboxOrder(order());
    await expect(startConversationForOpportunity(opportunityId)).rejects.toThrow("terminó");
  });
  it("blocks starting a conversation for an opted-out customer", async () => {
    await saveCustomerInsight({ customerId, conversationId, optOut: true });
    await expect(startConversationForOpportunity(opportunityId)).rejects.toThrow("opt-out");
  });
  it("generates tool schemas without exposing conversation identity", () => {
    const definitions = getOpenAiToolDefinitions();
    expect(definitions.length).toBeGreaterThan(10);
    for (const definition of definitions) {
      expect(definition.parameters.properties).not.toHaveProperty("conversationId");
      expect(definition.parameters.properties).not.toHaveProperty("customerId");
    }
  });
  it("creates exactly one complete sandbox order and rejects retries", async () => {
    const result = await createSandboxOrder(order());
    expect(result.total).toBe(3700);
    await expect(createSandboxOrder(order())).rejects.toThrow("ya tiene");
    expect((await database.query("select * from agente_comercial.orders")).rows).toHaveLength(1);
    expect((await database.query("select * from agente_comercial.order_items")).rows).toHaveLength(1);
  });
  it("rejects duplicate SKUs whose combined quantity exceeds stock", async () => {
    await expect(createSandboxOrder({ ...order(), items: [{ sku: "CAP-001", quantity: 500 }, { sku: "CAP-001", quantity: 500 }] })).rejects.toThrow("Stock");
    expect((await database.query("select * from agente_comercial.orders")).rows).toHaveLength(0);
  });
  it("rejects insufficient credit and an unapproved delivery", async () => {
    await database.exec("update agente_comercial.customers set credit_available=100");
    await expect(createSandboxOrder(order())).rejects.toThrow("Crédito");
    await database.exec("update agente_comercial.customers set credit_available=14500");
    const extraordinary = { ...order(), deliveryHours: 12 };
    await presentOffer(extraordinary);
    await expect(createSandboxOrder(extraordinary)).rejects.toThrow("entrega");
  });
  it("rolls back the order and status if a line insert fails", async () => {
    await database.exec("alter table agente_comercial.order_items add constraint test_failure check (quantity < 200)");
    try {
      await expect(createSandboxOrder(order())).rejects.toThrow();
      expect((await database.query("select * from agente_comercial.orders")).rows).toHaveLength(0);
      expect((await database.query("select ended_at from agente_comercial.conversations")).rows[0]).toEqual({ ended_at: null });
    } finally {
      await database.exec("alter table agente_comercial.order_items drop constraint test_failure");
    }
  });
  it("asks the manager for a discount only after the agent offered its own best price", async () => {
    await expect(requestApproval(request())).rejects.toThrow("mejor precio");
    await presentBestPrice(conversationId, 200, 17.65);
    await expect(requestApproval(request())).rejects.toThrow("$17.58");
    await presentBestPrice(conversationId, 200);
    await expect(requestApproval(request())).resolves.toMatchObject({ approvalId: expect.any(String) });
  });
  it("counts the best price as offered once the customer read it, whatever the closing question (2026-09-25 19:31)", async () => {
    await database.query(
      "insert into agente_comercial.messages (conversation_id, direction, sender, body) values ($1, 'outbound', 'agent', $2)",
      [conversationId, "Lo mejor que puedo dejarle es *$17.58 por unidad*, total *$879*. ¿Le serviría probarlo así?"]);
    await expect(requestApproval(request())).resolves.toMatchObject({ approvalId: expect.any(String) });
  });
  it("creates and reuses a pending approval, then accepts the exact approved order", async () => {
    await presentBestPrice(conversationId, 200);
    const first = await requestApproval(request());
    const second = await requestApproval(request());
    expect(second.approvalId).toBe(first.approvalId);
    await decideApproval(first.approvalId, "approve");
    await expect(decideApproval(first.approvalId, "reject")).rejects.toThrow("ya fue decidida");
    await presentOffer({ ...order(), discountPct: 8 });
    expect((await createSandboxOrder({ ...order(), discountPct: 8 })).total).toBe(3404);
  });
  it("does not accept an approval for another quantity", async () => {
    await presentBestPrice(conversationId, 200);
    const approval = await requestApproval(request());
    await decideApproval(approval.approvalId, "approve");
    const changed = { ...order(), discountPct: 8, items: [{ sku: "CAP-001", quantity: 201 }] };
    await presentOffer(changed);
    await expect(createSandboxOrder(changed)).rejects.toThrow("aprobación");
  });
  it("does not approve out-of-policy modifications or requests", async () => {
    await expect(requestApproval({ ...request(), requestedPct: 15 })).rejects.toThrow("política");
    await presentBestPrice(conversationId, 200);
    const approval = await requestApproval(request());
    await expect(decideApproval(approval.approvalId, "modify", 15)).rejects.toThrow("política");
    expect((await getApprovalResult({ approvalId: approval.approvalId, conversationId })).status).toBe("pending");
  });
  it("refuses unnecessary discount and delivery approvals", async () => {
    await expect(requestApproval({ ...request(), requestedPct: 4 })).rejects.toThrow("no requiere aprobación");
    await database.exec("update agente_comercial.products set express_eligible=true where sku='CAP-001'");
    await expect(requestApproval({
      customerId, conversationId, type: "delivery", productSku: "CAP-001", quantity: 200,
      requestedDeliveryHours: 24, reason: "Entrega", agentRecommendation: "Aprobar",
    })).rejects.toThrow("no requiere aprobación");
  });
  it("does not leak approval results across conversations", async () => {
    await presentBestPrice(conversationId, 200);
    const approval = await requestApproval(request());
    await expect(getApprovalResult({ approvalId: approval.approvalId, conversationId: opportunityId })).rejects.toThrow("no encontrada");
  });
  it("preserves incremental memory and makes opt-out sticky", async () => {
    await saveCustomerInsight({ customerId, conversationId, competidorMencionado: "Otro proveedor", optOut: true });
    await saveCustomerInsight({ customerId, conversationId, cantidad: 200, competidorMencionado: null, optOut: false });
    const { rows } = await database.query("select competidor_mencionado, cantidad, opt_out from agente_comercial.customer_insights");
    expect(rows).toEqual([{ competidor_mencionado: "Otro proveedor", cantidad: 200, opt_out: true }]);
    expect(await isCustomerSuppressed(customerId)).toBe(true);
    await expect(assertContactAllowed(customerId)).rejects.toThrow("opt-out");
    await expect(createSandboxOrder(order())).rejects.toThrow("opt-out");
    await expect(requestApproval(request())).rejects.toThrow("opt-out");
  });
  it("does not let the model close a sale without an order or reopen a closed conversation", async () => {
    await expect(updateOpportunityStage({ conversationId, stage: "closed" })).rejects.toThrow("sin pedido");
    await createSandboxOrder(order());
    await expect(updateOpportunityStage({ conversationId, stage: "discovery" })).rejects.toThrow("reabrir");
    await expect(updateOpportunityStage({ conversationId, stage: "closed" })).resolves.toMatchObject({ stage: "closed" });
  });

  it("resets only the reserved demo company and preserves every other customer", async () => {
    process.env.DEMO_WHATSAPP_RECIPIENT = "+507 6000-1234";
    expect(await prepareDemoScenario()).toBe(DEMO_OPPORTUNITY_ID);

    const demoConversation = "de000000-0000-4000-8000-000000000003";
    await database.query(
      "insert into agente_comercial.conversations (id, customer_id, opportunity_id) values ($1, $2, $3)",
      [demoConversation, DEMO_CUSTOMER_ID, DEMO_OPPORTUNITY_ID],
    );
    await database.query(
      "insert into agente_comercial.messages (conversation_id, direction, sender, body) values ($1, 'outbound', 'agent', 'Hola')",
      [demoConversation],
    );
    await database.query(
      "insert into agente_comercial.customer_insights (conversation_id, customer_id, opt_out) values ($1, $2, true)",
      [demoConversation, DEMO_CUSTOMER_ID],
    );
    await database.query(
      "insert into agente_comercial.orders (conversation_id, customer_id, subtotal, discount_pct, total) values ($1, $2, 925, 4, 888)",
      [demoConversation, DEMO_CUSTOMER_ID],
    );

    await prepareDemoScenario();

    expect((await database.query("select id from agente_comercial.conversations where id=$1", [conversationId])).rows).toHaveLength(1);
    expect((await database.query("select id from agente_comercial.conversations where customer_id=$1", [DEMO_CUSTOMER_ID])).rows).toHaveLength(0);
    expect((await database.query("select id from agente_comercial.orders where customer_id=$1", [DEMO_CUSTOMER_ID])).rows).toHaveLength(0);
    expect((await database.query("select id from agente_comercial.customer_insights where customer_id=$1", [DEMO_CUSTOMER_ID])).rows).toHaveLength(0);
    expect((await database.query("select id from agente_comercial.purchases where customer_id=$1", [DEMO_CUSTOMER_ID])).rows).toHaveLength(3);
    expect((await database.query("select status from agente_comercial.opportunities where id=$1", [DEMO_OPPORTUNITY_ID])).rows).toEqual([{ status: "preparada" }]);
    expect(await getDemoScenarioStatus()).toMatchObject({ recipientConfigured: true, scenarioReady: true });
  });

  it("cancels a reset if the reserved demo customer contains an unrelated opportunity", async () => {
    process.env.DEMO_WHATSAPP_RECIPIENT = "+50760001234";
    await prepareDemoScenario();
    await database.query(
      "insert into agente_comercial.opportunities (customer_id) values ($1)",
      [DEMO_CUSTOMER_ID],
    );
    await expect(prepareDemoScenario()).rejects.toThrow("datos ajenos");
  });

  it("accepts the previous fixture name and rebuilds it with the presentation name", async () => {
    process.env.DEMO_WHATSAPP_RECIPIENT = "+50760001234";
    await prepareDemoScenario();
    await database.query("update agente_comercial.customers set name=$1 where id=$2", ["Empresa Demo", DEMO_CUSTOMER_ID]);
    expect(await getDemoScenarioStatus()).toMatchObject({ scenarioReady: true });

    await prepareDemoScenario();
    expect((await database.query("select name from agente_comercial.customers where id=$1", [DEMO_CUSTOMER_ID])).rows)
      .toEqual([{ name: DEMO_CUSTOMER_NAME }]);
  });
});
