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
