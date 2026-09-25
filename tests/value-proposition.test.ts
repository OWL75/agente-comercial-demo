import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { COMPANY_ADVANTAGES } from "@/lib/agent/company-profile";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => {
  const { sql } = await import("./sql-harness");
  return { sql, toJsonb: sql.json };
});

const { database } = await import("./sql-harness");
const { getValueProposition } = await import("@/lib/tools/value");

const customerId = "11111111-1111-1111-1111-111111111111";

beforeAll(async () => {
  await database.exec(await readFile(new URL("./fixtures/demo-schema.sql", import.meta.url), "utf8"));
});
afterAll(async () => database.close());

beforeEach(async () => {
  await database.exec("truncate agente_comercial.customers, agente_comercial.products cascade");
  await database.exec("insert into agente_comercial.products (id,sku,name,unit_price,stock,express_eligible) values ('44444444-4444-4444-4444-444444444444','CAP-001','Shampoo Professional 1L',18.50,820,true)");
});

async function customer(creditAvailable: number) {
  await database.query("insert into agente_comercial.customers (id, name, credit_available, payment_terms) values ($1, 'Belleza del Istmo', $2, '30 días')", [customerId, creditAvailable]);
}

async function purchase(date: string, quantity: number) {
  const { rows } = await database.query<{ id: string }>("insert into agente_comercial.purchases (customer_id, purchase_date, amount) values ($1, $2, $3) returning id", [customerId, date, quantity * 18.5]);
  await database.query("insert into agente_comercial.purchase_items (purchase_id, product_id, quantity, unit_price) values ($1, '44444444-4444-4444-4444-444444444444', $2, 18.50)", [rows[0].id, quantity]);
}

describe("value proposition: why this customer gains with Nova", () => {
  it("states only facts from the customer's account and usual order", async () => {
    await customer(12000);
    await purchase("2026-03-10", 40);
    await purchase("2026-06-02", 50);
    const value = await getValueProposition({ customerId });
    expect(value.customerFacts).toEqual([
      "Ya nos conoce: 2 pedidos con nosotros desde marzo de 2026; su pedido habitual se prepara sin volver a explicarlo.",
      "Su cuenta tiene crédito a 30 días con $12,000.00 disponibles: no tiene que pagar por adelantado.",
      "Hay stock para su pedido habitual de 50 unidades de Shampoo Professional 1L.",
      "Shampoo Professional 1L califica para entrega al día siguiente.",
    ]);
    expect(value.companyAdvantages).toEqual(COMPANY_ADVANTAGES);
  });

  it("claims nothing it cannot back: no credit, no history, no stock", async () => {
    await customer(0);
    await database.exec("update agente_comercial.products set stock = 10, express_eligible = false");
    await purchase("2026-06-02", 50);
    const value = await getValueProposition({ customerId });
    expect(value.customerFacts.join(" ")).not.toMatch(/crédito|stock|día siguiente/);
  });
});
