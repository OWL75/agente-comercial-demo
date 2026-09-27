import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The panel refreshes itself when the workspace version changes. These tests
// run the real version query (PostgreSQL/WASM) and the real SSE route to show
// that every change the panel displays produces a new event.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => {
  const { sql } = await import("./sql-harness");
  return { sql, toJsonb: sql.json };
});

import { database } from "./sql-harness";
import { workspaceVersion } from "@/lib/live/versions";
import { GET } from "@/app/api/live/route";

const customerId = "11111111-1111-1111-1111-111111111111";
const opportunityId = "33333333-3333-3333-3333-333333333333";
const conversationId = "22222222-2222-2222-2222-222222222222";

beforeAll(async () => {
  await database.exec(await readFile(new URL("./fixtures/demo-schema.sql", import.meta.url), "utf8"));
  // Starting PostgreSQL/WASM can take a while when the whole suite runs in parallel.
}, 30_000);
afterAll(async () => database.close());

beforeEach(async () => {
  await database.exec("truncate agente_comercial.customers cascade");
  await database.query("insert into agente_comercial.customers (id, name) values ($1, 'Belleza del Istmo')", [customerId]);
  await database.query("insert into agente_comercial.opportunities (id, customer_id) values ($1, $2)", [opportunityId, customerId]);
  await database.query("insert into agente_comercial.conversations (id, customer_id, opportunity_id) values ($1, $2, $3)", [
    conversationId,
    customerId,
    opportunityId,
  ]);
});

async function changesAfter(write: () => Promise<unknown>): Promise<boolean> {
  const before = await workspaceVersion();
  await write();
  return (await workspaceVersion()) !== before;
}

describe("workspace version: anything the panel shows changes it", () => {
  it("is stable while nothing changes", async () => {
    expect(await workspaceVersion()).toBe(await workspaceVersion());
  });

  it("a customer message or an agent reply", async () => {
    expect(
      await changesAfter(() =>
        database.query("insert into agente_comercial.messages (conversation_id, direction, sender, body) values ($1, 'inbound', 'customer', 'El precio')", [conversationId]),
      ),
    ).toBe(true);
    expect(
      await changesAfter(() =>
        database.query("insert into agente_comercial.messages (conversation_id, direction, sender, body) values ($1, 'outbound', 'agent', 'Entiendo.')", [conversationId]),
      ),
    ).toBe(true);
  });

  it("agent activity (tool calls, stage changes, payments are all logged)", async () => {
    expect(
      await changesAfter(() =>
        database.query("insert into agente_comercial.audit_log (conversation_id, category, label) values ($1, 'tool_call', 'Etapa actualizada: negotiating')", [conversationId]),
      ),
    ).toBe(true);
  });

  it("an exception that is created and then decided", async () => {
    const { rows } = await database.query<{ id: string }>(
      "insert into agente_comercial.approvals (conversation_id, customer_id, type) values ($1, $2, 'discount') returning id",
      [conversationId, customerId],
    );
    expect(
      await changesAfter(() =>
        database.query("update agente_comercial.approvals set status = 'approved', decided_at = now() where id = $1", [rows[0].id]),
      ),
    ).toBe(true);
  });

  it("an order that gets paid, and a conversation that ends", async () => {
    const { rows } = await database.query<{ id: string }>(
      "insert into agente_comercial.orders (conversation_id, customer_id, total, status) values ($1, $2, 850, 'pendiente_pago') returning id",
      [conversationId, customerId],
    );
    expect(await changesAfter(() => database.query("update agente_comercial.orders set status = 'pagado' where id = $1", [rows[0].id]))).toBe(true);
    expect(
      await changesAfter(() => database.query("update agente_comercial.conversations set ended_at = now() where id = $1", [conversationId])),
    ).toBe(true);
  });
});

describe("GET /api/live (Server-Sent Events)", () => {
  it("sends the current version at once and a new event when a message arrives", async () => {
    const abort = new AbortController();
    const response = await GET(new Request("http://localhost/api/live", { signal: abort.signal }));
    expect(response.headers.get("content-type")).toMatch(/^text\/event-stream/);
    expect(response.headers.get("x-accel-buffering")).toBe("no");

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const nextVersion = async (): Promise<string> => {
      for (;;) {
        const match = buffer.match(/data: (\{.*\})\n\n/);
        if (match) {
          buffer = buffer.slice(buffer.indexOf(match[0]) + match[0].length);
          return (JSON.parse(match[1]) as { v: string }).v;
        }
        const { value, done } = await reader.read();
        if (done) throw new Error("stream closed");
        buffer += decoder.decode(value, { stream: true });
      }
    };

    const first = await nextVersion();
    expect(first).toBe(await workspaceVersion());

    await database.query("insert into agente_comercial.messages (conversation_id, direction, sender, body) values ($1, 'inbound', 'customer', 'Hola')", [conversationId]);
    const second = await nextVersion();
    expect(second).not.toBe(first);

    abort.abort();
    await reader.cancel().catch(() => {});
  }, 10_000);
});
