import "server-only";
import { z } from "zod";
import { sql, toJsonb } from "@/lib/db";
import { getActivePolicy } from "@/lib/db/policies";
import { uuidLike } from "@/lib/zod-helpers";
import { evaluateDelivery, evaluateDiscount } from "@/lib/policy/evaluate";
import { autonomyFloorUnitPrice } from "@/lib/policy/verified-offer";

export const requestApprovalInput = z.object({
  conversationId: uuidLike,
  customerId: uuidLike,
  type: z.enum(["discount", "credit", "delivery", "other"]),
  productSku: z.string().optional().describe("SKU del producto involucrado, si aplica."),
  quantity: z.number().int().positive().optional().describe("Cantidad involucrada, si aplica."),
  requestedPct: z.number().min(0).max(100).optional().describe("Porcentaje de descuento solicitado (solo type=discount)."),
  requestedCreditAmount: z.number().positive().optional().describe("Monto de crédito adicional solicitado (solo type=credit)."),
  requestedDeliveryHours: z.number().int().positive().optional().describe("Horas de entrega solicitadas (solo type=delivery)."),
  description: z.string().optional().describe("Descripción libre de la excepción (solo type=other)."),
  reason: z
    .string()
    .describe("Por qué el cliente pide esto, en tus propias palabras — la verá quien apruebe."),
  agentRecommendation: z
    .string()
    .describe('Tu recomendación breve, ej. "Aprobar 8%, es cliente recurrente" o "Rechazar, muy por encima de política".'),
}).superRefine((input, ctx) => {
  const field = input.type === "discount" ? "requestedPct" : input.type === "credit" ? "requestedCreditAmount" : input.type === "delivery" ? "requestedDeliveryHours" : "description";
  if (input[field] == null) ctx.addIssue({ code: "custom", path: [field], message: "Falta el valor solicitado." });
  if (input.type !== "other" && (!input.productSku || !input.quantity)) {
    ctx.addIssue({ code: "custom", message: "Una excepción comercial requiere producto y cantidad exactos." });
  }
});
export type RequestApprovalInput = z.infer<typeof requestApprovalInput>;

export async function requestApproval(input: RequestApprovalInput) {
  input = requestApprovalInput.parse(input);
  const policy = await getActivePolicy();
  if (!policy) throw new Error("No hay una política comercial activa configurada");

  if (input.type === "discount" && input.requestedPct! > policy.config.discount.approvalMaxPct) {
    throw new Error("No se puede solicitar un descuento fuera de política.");
  }
  return sql.begin(async (tx) => {
    const [conversation] = await tx`
      select id, ended_at from agente_comercial.conversations
      where id = ${input.conversationId} and customer_id = ${input.customerId} for update
    `;
    if (!conversation || conversation.ended_at) throw new Error("Conversación no disponible.");
    const [suppression] = await tx`select id from agente_comercial.customer_insights
      where customer_id = ${input.customerId} and opt_out = true limit 1`;
    if (suppression) throw new Error("Cliente excluido por opt-out.");
    const [customer] = await tx<Array<{ credit_total: string; credit_available: string }>>`
      select credit_total, credit_available from agente_comercial.customers where id = ${input.customerId}
    `;
    if (!customer) throw new Error(`Cliente ${input.customerId} no encontrado`);

    let product: { sku: string; name: string; unitPrice: number; stock: number; expressEligible: boolean } | null = null;
    if (input.productSku) {
      const [p] = await tx<Array<{ sku: string; name: string; unit_price: string; stock: number; express_eligible: boolean }>>`
        select sku, name, unit_price, stock, express_eligible
        from agente_comercial.products where sku = ${input.productSku}
      `;
      if (!p) throw new Error(`Producto con SKU "${input.productSku}" no encontrado`);
      product = {
        sku: p.sku, name: p.name, unitPrice: Number(p.unit_price), stock: p.stock,
        expressEligible: p.express_eligible === true,
      };
    }

    if (input.type === "discount" &&
        evaluateDiscount(input.requestedPct!, policy.config.discount).decision !== "requires_approval") {
      throw new Error("Este descuento no requiere aprobación humana; usa la decisión de la política.");
    }
    // The owner's rule: the agent's own best price goes first. Asking the
    // manager for less before the customer has even seen it gives margin away.
    if (input.type === "discount" && product) {
      const floor = autonomyFloorUnitPrice(product.unitPrice, policy.config.discount.autoMaxPct);
      const [lastPresented] = await tx<Array<{ net: string | null }>>`
        select payload->'offer'->>'netUnitPrice' as net from agente_comercial.audit_log
        where conversation_id = ${input.conversationId} and category = 'policy_check'
          and label = 'Oferta verificada presentada para confirmación'
        order by created_at desc limit 1
      `;
      const lastOffered = lastPresented?.net == null ? null : Number(lastPresented.net);
      // The best price counts as offered once the customer read it, however the
      // message closed ("¿Le serviría así?" does not register a presentation).
      const agentMessages = await tx<Array<{ body: string }>>`
        select body from agente_comercial.messages
        where conversation_id = ${input.conversationId} and sender = 'agent'
      `;
      const floorWritten = agentMessages.some((m) =>
        [...m.body.matchAll(/\$\s*(\d+(?:[.,]\d{1,2})?)/g)].some((match) => Math.abs(Number(match[1].replace(",", ".")) - floor) < 0.005));
      if (!floorWritten && (lastOffered == null || lastOffered - floor > 0.004)) {
        throw new Error(
          `Todavía no le ofreciste tu mejor precio. Antes de consultar al gerente, prepara con prepare_verified_offer la oferta a $${floor.toFixed(2)} por unidad (netUnitPrice) y preséntasela con la razón para quedarse con Nova. Solo si insiste en su precio, solicita la aprobación.`,
        );
      }
    }
    if (input.type === "delivery" && product &&
        evaluateDelivery(input.requestedDeliveryHours!, product.expressEligible, policy.config.delivery).decision !== "requires_approval") {
      throw new Error("Esta entrega no requiere aprobación humana para el producto indicado.");
    }
    if (input.type === "credit" && !policy.config.credit.increaseRequiresApproval) {
      throw new Error("El aumento de crédito no requiere aprobación según la política vigente.");
    }

    // Everything numeric here is re-derived from real data at the moment the
    // approval is created — never copied from what the model said earlier in
    // the conversation, so the human approver always sees current facts.
    const requestedValue: Record<string, unknown> = { quantity: input.quantity ?? null, productSku: product?.sku ?? null };
    let policyMin: number | null = null;
    let policyMax: number | null = null;

    if (input.type === "discount") {
      requestedValue.pct = input.requestedPct ?? null;
      policyMin = policy.config.discount.autoMaxPct;
      policyMax = policy.config.discount.approvalMaxPct;
    } else if (input.type === "credit") {
      requestedValue.amount = input.requestedCreditAmount ?? null;
    } else if (input.type === "delivery") {
      requestedValue.hours = input.requestedDeliveryHours ?? null;
      policyMax = policy.config.delivery.standardHours;
    } else {
      requestedValue.description = input.description ?? null;
    }

    const context = {
      policyVersion: policy.version,
      reason: input.reason,
      productName: product?.name ?? null,
      productSku: product?.sku ?? null,
      quantity: input.quantity ?? null,
      listValue: product && input.quantity ? product.unitPrice * input.quantity : null,
      unitPrice: product?.unitPrice ?? null,
      stockAvailable: product?.stock ?? null,
      creditAvailable: Number(customer.credit_available),
      creditTotal: Number(customer.credit_total),
      autonomyMaxPct: input.type === "discount" ? policy.config.discount.autoMaxPct : null,
    };

    // Idempotent per (conversation, type): the model sometimes files the same
    // exception twice in one negotiation (once on a conditional offer, again
    // once the customer confirms) — refresh the existing pending row instead
    // of creating a second card for the same underlying decision.
    const [existingPending] = await tx<Array<{ id: string }>>`
      select id from agente_comercial.approvals
      where conversation_id = ${input.conversationId} and type = ${input.type} and status = 'pending'
      limit 1
    `;

    const [row] = existingPending
      ? await tx<Array<{ id: string; status: string }>>`
          update agente_comercial.approvals
          set requested_value = ${toJsonb(requestedValue)},
              policy_min = ${policyMin},
              policy_max = ${policyMax},
              agent_recommendation = ${input.agentRecommendation},
              context = ${tx.json(context)}
          where id = ${existingPending.id} and status = 'pending'
          returning id, status
        `
      : await tx<Array<{ id: string; status: string }>>`
          insert into agente_comercial.approvals
            (conversation_id, customer_id, type, requested_value, policy_min, policy_max, agent_recommendation, context)
          values (
            ${input.conversationId},
            ${input.customerId},
            ${input.type},
            ${toJsonb(requestedValue)},
            ${policyMin},
            ${policyMax},
            ${input.agentRecommendation},
            ${tx.json(context)}
          )
          returning id, status
        `;

    if (!row) throw new Error("La solicitud fue decidida mientras se actualizaba. Vuelve a consultar su estado.");
    await tx`
      update agente_comercial.conversations set stage = 'awaiting_approval' where id = ${input.conversationId}
    `;
    await tx`
      update agente_comercial.opportunities
      set status = 'esperando_aprobacion', updated_at = now()
      where id = (select opportunity_id from agente_comercial.conversations where id = ${input.conversationId})
    `;

    return { approvalId: row.id, status: row.status };
  });
}

export const getApprovalResultInput = z.object({
  conversationId: uuidLike,
  approvalId: uuidLike,
});
export type GetApprovalResultInput = z.infer<typeof getApprovalResultInput>;

export async function getApprovalResult(input: GetApprovalResultInput) {
  const [row] = await sql`
    select id, status, decided_value, decided_by, decided_at
    from agente_comercial.approvals
    where id = ${input.approvalId} and conversation_id = ${input.conversationId}
  `;
  if (!row) throw new Error(`Aprobación ${input.approvalId} no encontrada`);
  return row;
}
