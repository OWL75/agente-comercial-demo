import "server-only";
import { z } from "zod";
import { sql } from "@/lib/db";

async function findProductBySku(sku: string) {
  const [row] = await sql`
    select id, sku, name, unit_price, stock, express_eligible
    from agente_comercial.products
    where sku = ${sku}
  `;
  if (!row) throw new Error(`Producto con SKU "${sku}" no encontrado`);
  return row;
}

export const getProductInput = z.object({ sku: z.string() });
export type GetProductInput = z.infer<typeof getProductInput>;

export async function getProduct(input: GetProductInput) {
  return findProductBySku(input.sku);
}

export const getProductPriceInput = z.object({ sku: z.string() });
export type GetProductPriceInput = z.infer<typeof getProductPriceInput>;

export async function getProductPrice(input: GetProductPriceInput) {
  const product = await findProductBySku(input.sku);
  return { sku: product.sku, name: product.name, unitPrice: Number(product.unit_price) };
}

export const getInventoryInput = z.object({ sku: z.string() });
export type GetInventoryInput = z.infer<typeof getInventoryInput>;

export async function getInventory(input: GetInventoryInput) {
  const product = await findProductBySku(input.sku);
  return { sku: product.sku, name: product.name, stock: product.stock };
}

const SKU_TOKEN = /\b[A-Z]{2,5}-\d{2,5}\b/;

/**
 * The model sometimes passes the product name ("Shampoo Professional 1L") or
 * "name (SKU)" where a SKU is expected. Resolve those to the real SKU when the
 * match is unambiguous; anything else is left as is and fails validation.
 */
export async function resolveSku(value: string): Promise<string> {
  const [exact] = await sql`select sku from agente_comercial.products where sku = ${value}`;
  if (exact) return value;
  const embedded = value.toUpperCase().match(SKU_TOKEN)?.[0];
  if (embedded) {
    const [bySku] = await sql`select sku from agente_comercial.products where sku = ${embedded}`;
    if (bySku) return embedded;
  }
  const byName = await sql<Array<{ sku: string }>>`
    select sku from agente_comercial.products where lower(name) = lower(${value.trim()}) limit 2
  `;
  return byName.length === 1 ? byName[0].sku : value;
}

/** Applies resolveSku to every product reference a tool can receive. */
export async function resolveProductRefs(args: unknown): Promise<unknown> {
  if (typeof args !== "object" || args === null) return args;
  const input = { ...(args as Record<string, unknown>) };
  for (const key of ["sku", "productSku"]) {
    if (typeof input[key] === "string") input[key] = await resolveSku(input[key] as string);
  }
  if (Array.isArray(input.items)) {
    input.items = await Promise.all(input.items.map(async (item) =>
      item && typeof item === "object" && typeof (item as { sku?: unknown }).sku === "string"
        ? { ...item, sku: await resolveSku((item as { sku: string }).sku) }
        : item));
  }
  return input;
}
