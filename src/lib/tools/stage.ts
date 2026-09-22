import "server-only";
import { z } from "zod";
import { sql } from "@/lib/db";
import type { OpportunityStatus } from "@/lib/db/opportunities";
import { uuidLike } from "@/lib/zod-helpers";

const CONVERSATION_STAGES = [
  "discovery",
  "objection_handling",
  "negotiating",
  "awaiting_approval",
  "closing",
  "closed",
] as const;

// The model only ever picks a conversation-level stage; the mapping to the
// customer-facing opportunity status (what Pantalla 1 shows) is a system
// decision, not something described in free text by the model.
const STAGE_TO_OPPORTUNITY_STATUS: Record<(typeof CONVERSATION_STAGES)[number], OpportunityStatus> = {
  discovery: "conversando",
  objection_handling: "conversando",
  negotiating: "negociando",
  awaiting_approval: "esperando_aprobacion",
  closing: "negociando",
  closed: "cerrada",
};

export const updateOpportunityStageInput = z.object({
  conversationId: uuidLike,
  stage: z.enum(CONVERSATION_STAGES),
  nextObjective: z
    .string()
    .describe("Qué buscas lograr en el próximo intercambio con el cliente, en una frase breve.")
    .optional(),
});
export type UpdateOpportunityStageInput = z.infer<typeof updateOpportunityStageInput>;

export async function updateOpportunityStage(input: UpdateOpportunityStageInput) {
  input = updateOpportunityStageInput.parse(input);
  return sql.begin(async (tx) => {
    const [conversation] = await tx`
      select opportunity_id, ended_at from agente_comercial.conversations
      where id = ${input.conversationId} for update
    `;
    if (!conversation) throw new Error("Conversación no encontrada.");
    if (input.stage === "closed") {
      const [order] = await tx`select id from agente_comercial.orders where conversation_id = ${input.conversationId} limit 1`;
      if (!order) throw new Error("No se puede marcar venta cerrada sin pedido.");
    } else if (conversation.ended_at) {
      throw new Error("No se puede reabrir una conversación terminada.");
    }
    const opportunityStatus = STAGE_TO_OPPORTUNITY_STATUS[input.stage];
    await tx`update agente_comercial.conversations
      set stage = ${input.stage}, objective_current = coalesce(${input.nextObjective ?? null}, objective_current)
      where id = ${input.conversationId}`;
    await tx`update agente_comercial.opportunities set status = ${opportunityStatus}, updated_at = now()
      where id = ${conversation.opportunity_id}`;
    return { stage: input.stage, opportunityStatus };
  });
}
