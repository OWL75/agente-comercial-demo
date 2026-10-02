import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// A prospect writes "DEMO" to the agent's WhatsApp: they get their own copy of
// the demo company, Fernán sells to them, and none of it touches the owner's
// panel numbers. Real SQL (PostgreSQL/WASM); WhatsApp, Telegram and the
// agent's first message are faked.

const h = vi.hoisted(() => ({
  whatsapp: [] as Array<{ to: string; text: string }>,
  owner: [] as Array<{ conversationId: string | null; text: string }>,
  started: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => {
  const { sql } = await import("./sql-harness");
  return { sql, toJsonb: sql.json };
});
vi.mock("@/lib/channel/whatsapp-client", () => ({
  isWhatsAppConfigured: () => true,
  sendWhatsAppMessage: async (to: string, text: string) => { h.whatsapp.push({ to, text }); return { messageId: null }; },
}));
vi.mock("@/lib/agent/owner-notify", () => ({
  notifyOwner: async (conversationId: string | null, text: string) => { h.owner.push({ conversationId, text }); return true; },
}));
vi.mock("@/lib/agent/conversation-lifecycle", async () => {
  const { sql } = await import("./sql-harness");
  return {
    startConversationForOpportunity: async (opportunityId: string) => {
      const [o] = await sql<Array<{ customer_id: string }>>`select customer_id from agente_comercial.opportunities where id = ${opportunityId}`;
      const [c] = await sql<Array<{ id: string }>>`
        insert into agente_comercial.conversations (opportunity_id, customer_id, channel) values (${opportunityId}, ${o.customer_id}, 'whatsapp') returning id`;
      h.started.push(c.id);
      return c.id;
    },
  };
});

import { database } from "./sql-harness";
import { DEMO_INTRO, demoClosingText, isDemoRequest, startProspectDemo } from "@/lib/prospect/demo";
import { isProspectConversation } from "@/lib/prospect/flags";
import { getDashboardKpis, listOpportunities } from "@/lib/db/opportunities";
import { listConversations } from "@/lib/db/conversations";
import { founderSlotsLeft, registerFounder } from "@/lib/prospect/signup";

const PROSPECT = "50761234567";

beforeAll(async () => {
  await database.exec(await readFile(new URL("./fixtures/demo-schema.sql", import.meta.url), "utf8"));
}, 30_000);
afterAll(async () => database.close());

beforeEach(async () => {
  await database.exec("truncate agente_comercial.customers, agente_comercial.products, agente_comercial.audit_log cascade");
  await database.exec(`insert into agente_comercial.products (sku,name,unit_price,stock,express_eligible) values
    ('CAP-001','Shampoo Professional 1L',18.50,820,true), ('CAP-005','Mascarilla Hidratante',13.40,300,false)`);
  await database.exec("insert into agente_comercial.customers (name, segment) values ('Cliente real', 'Distribuidor')");
  h.whatsapp = [];
  h.owner = [];
  h.started = [];
  vi.stubEnv("PUBLIC_BASE_URL", "https://demo.test");
});

describe("'DEMO' from the page or the video", () => {
  it("recognizes the button's text, not ordinary messages", () => {
    for (const text of ["DEMO", "demo", " Demo! ", "Quiero probar a Fernán", "probar a fernan"]) expect(isDemoRequest(text)).toBe(true);
    for (const text of ["Hola", "Quiero una demo de precios", "17.75", "No, gracias"]) expect(isDemoRequest(text)).toBe(false);
  });
});

describe("a prospect's demo", () => {
  it("creates their own copy of the demo company, explains the game, starts Fernán and tells the owner about the lead", async () => {
    const result = await startProspectDemo(PROSPECT);
    expect(result.started).toBe(true);

    const { rows: customers } = await database.query<{ name: string; segment: string; phone: string; credit_available: string }>(
      "select name, segment, phone, credit_available from agente_comercial.customers where segment = 'Prospecto demo'");
    expect(customers).toEqual([expect.objectContaining({ name: "Distribuidora Belleza del Istmo", phone: `+${PROSPECT}`, credit_available: "12000" })]);
    const { rows: [purchases] } = await database.query<{ n: number }>(
      "select count(*)::int as n from agente_comercial.purchases p join agente_comercial.customers c on c.id = p.customer_id where c.segment = 'Prospecto demo'");
    expect(purchases.n).toBe(3);

    expect(h.whatsapp[0]).toEqual({ to: `+${PROSPECT}`, text: DEMO_INTRO });
    expect(h.started).toHaveLength(1);
    expect(await isProspectConversation(h.started[0])).toBe(true);
    expect(h.owner.at(-1)).toMatchObject({ conversationId: null, text: expect.stringContaining(`+${PROSPECT}`) });
  });

  it("stays out of the owner's numbers and lists, and shows up as a prospect", async () => {
    await startProspectDemo(PROSPECT);
    expect((await listOpportunities()).map((o) => o.customerName)).not.toContain("Distribuidora Belleza del Istmo");
    const kpis = await getDashboardKpis();
    expect(kpis.clientesAnalizados).toBe(1);
    expect(kpis.conversacionesActivas).toBe(0);
    expect(await listConversations(10)).toHaveLength(0);
    expect(await listConversations(10, { prospects: true })).toHaveLength(1);
  });

  it("'DEMO' again starts over, closing the previous demo; and it is limited per phone", async () => {
    await startProspectDemo(PROSPECT);
    await startProspectDemo(PROSPECT);
    const { rows: [open] } = await database.query<{ n: number }>(
      "select count(*)::int as n from agente_comercial.conversations where ended_at is null");
    expect(open.n).toBe(1);

    await startProspectDemo(PROSPECT);
    const fourth = await startProspectDemo(PROSPECT);
    expect(fourth).toEqual({ started: false, reason: "per_phone_limit" });
    expect(h.whatsapp.at(-1)!.text).toMatch(/Ya probó la demo 3 veces hoy/);
  });

  it("ends with the founder offer at half price and the link to activate it", () => {
    const text = demoClosingText();
    expect(text).toContain("implementación $750 (antes $1,500)");
    expect(text).toContain("$197/mes (antes $297)");
    expect(text).toContain("https://demo.test/fernan");
  });
});

describe("founder sign-up", () => {
  it("takes a slot, notifies the owner and becomes a waiting list when the 5 slots are gone", async () => {
    expect(await founderSlotsLeft()).toBe(5);
    const signup = { company: "Distribuidora X", contact: "Ana", whatsapp: "+507 6000-0000", method: "yappy" as const, reference: "YP-123" };
    expect(await registerFounder(signup)).toEqual({ ok: true });
    expect(await founderSlotsLeft()).toBe(4);
    expect(h.owner.at(-1)!.text).toMatch(/Nuevo registro de cliente fundador[\s\S]*Distribuidora X[\s\S]*Yappy · referencia YP-123/);

    for (let i = 0; i < 4; i++) await registerFounder({ ...signup, company: `Empresa ${i}` });
    expect(await founderSlotsLeft()).toBe(0);
    await registerFounder({ ...signup, company: "Tarde" });
    expect(h.owner.at(-1)!.text).toMatch(/lista de espera/);
  });
});
