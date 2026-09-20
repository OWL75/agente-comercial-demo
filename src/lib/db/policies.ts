import "server-only";
import { sql } from "@/lib/db";

export type CommercialPolicyConfig = {
  discount: { autoMaxPct: number; approvalMaxPct: number };
  credit: { existingConditionAuto: boolean; increaseRequiresApproval: boolean };
  delivery: {
    standardHours: number;
    expressHours: number;
    expressRequiresEligibleStock: boolean;
    extraordinaryRequiresApproval: boolean;
  };
  stock: { neverConfirmWithoutCheck: boolean };
};

export async function getActivePolicy(): Promise<{
  version: number;
  config: CommercialPolicyConfig;
} | null> {
  const [row] = await sql<Array<{ version: number; config: CommercialPolicyConfig }>>`
    select version, config
    from agente_comercial.commercial_policies
    where is_active = true
    order by version desc
    limit 1
  `;
  return row ?? null;
}
