import "server-only";
import { sql } from "@/lib/db";

/** Customer-wide suppression, including insights from older conversations. */
export async function isCustomerSuppressed(customerId: string): Promise<boolean> {
  const [row] = await sql`
    select exists (
      select 1 from agente_comercial.customer_insights
      where customer_id = ${customerId} and opt_out = true
    ) as suppressed
  `;
  return Boolean(row.suppressed);
}

export async function assertContactAllowed(customerId: string): Promise<void> {
  if (await isCustomerSuppressed(customerId)) {
    throw new Error("Cliente excluido de contacto por opt-out. El agente no puede reactivarlo.");
  }
}
