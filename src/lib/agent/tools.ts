import "server-only";
import { toJSONSchema, type ZodType } from "zod";
import {
  getCustomerProfile,
  getCustomerProfileInput,
  getPurchaseHistory,
  getPurchaseHistoryInput,
  getCustomerOpportunity,
  getCustomerOpportunityInput,
  saveCustomerInsight,
  saveCustomerInsightInput,
} from "@/lib/tools/customer";
import { getProduct, getProductInput, getProductPrice, getProductPriceInput, getInventory, getInventoryInput } from "@/lib/tools/catalog";
import { getCreditStatus, getCreditStatusInput } from "@/lib/tools/credit";
import { getDeliveryOptions, getDeliveryOptionsInput } from "@/lib/tools/delivery";
import { getDiscountPolicy, getDiscountPolicyInput } from "@/lib/tools/discount";
import { requestApproval, requestApprovalInput, getApprovalResult, getApprovalResultInput } from "@/lib/tools/approvals";
import { createSandboxOrder, createSandboxOrderInput } from "@/lib/tools/orders";
import { updateOpportunityStage, updateOpportunityStageInput } from "@/lib/tools/stage";
import { prepareVerifiedOffer, prepareVerifiedOfferInput } from "@/lib/tools/offers";
import { assertOrderAllowed, type TurnTrigger } from "@/lib/agent/order-guard";
import { askOwner, notifyOwnerOfApproval } from "@/lib/agent/owner-notify";
import { z } from "zod";

// Identity the model never has to handle: every tool call in a conversation
// is scoped to that one conversation and its one customer, so the registry
// injects both before validating the model's arguments — never trusting a
// customerId/conversationId the model typed out itself (see runtime.ts).
// `trigger`/`customerMessage` describe the turn, so order creation can refuse
// turns the customer did not start (opening, follow-up, post-approval resume).
export type ToolContext = {
  conversationId: string;
  customerId: string;
  trigger: TurnTrigger;
  customerMessage?: string;
};

type AnyTool = {
  name: string;
  description: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: ZodType<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: (input: any, ctx: ToolContext) => Promise<unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  label: (input: any, result: any) => string;
};

function tool<T>(def: {
  name: string;
  description: string;
  schema: ZodType<T>;
  execute: (input: T, ctx: ToolContext) => Promise<unknown>;
  label: (input: T, result: unknown) => string;
}): AnyTool {
  return def as AnyTool;
}

export const TOOLS: AnyTool[] = [
  tool({
    name: "get_customer_profile",
    description: "Obtiene el perfil comercial completo del cliente de esta conversación: segmento, frecuencia de compra, ticket promedio, crédito y condición de pago.",
    schema: getCustomerProfileInput,
    execute: (input, ctx) => getCustomerProfile({ ...input, customerId: ctx.customerId }),
    label: () => "Perfil del cliente consultado",
  }),
  tool({
    name: "get_purchase_history",
    description: "Obtiene el historial de compras del cliente de esta conversación, incluyendo los productos de cada pedido.",
    schema: getPurchaseHistoryInput,
    execute: (input, ctx) => getPurchaseHistory({ ...input, customerId: ctx.customerId }),
    label: () => "Historial de compras consultado",
  }),
  tool({
    name: "get_customer_opportunity",
    description: "Obtiene la oportunidad comercial detectada para el cliente de esta conversación: por qué se detectó y la estrategia sugerida.",
    schema: getCustomerOpportunityInput,
    execute: (input, ctx) => getCustomerOpportunity({ ...input, customerId: ctx.customerId }),
    label: () => "Oportunidad del cliente consultada",
  }),
  tool({
    name: "get_product",
    description: "Obtiene los datos de un producto del catálogo por su SKU.",
    schema: getProductInput,
    execute: (input) => getProduct(input),
    label: (input) => `Consultando ${input.sku}`,
  }),
  tool({
    name: "get_product_price",
    description: "Obtiene el precio de lista oficial de un producto. Nunca inventes un precio: siempre consulta esta herramienta.",
    schema: getProductPriceInput,
    execute: (input) => getProductPrice(input),
    label: (_input, result: unknown) => `Precio consultado: $${(result as { unitPrice: number }).unitPrice}`,
  }),
  tool({
    name: "get_inventory",
    description: "Obtiene el stock disponible de un producto. Nunca confirmes una venta sin consultar esta herramienta primero.",
    schema: getInventoryInput,
    execute: (input) => getInventory(input),
    label: (_input, result: unknown) => `Stock consultado: ${(result as { stock: number }).stock}`,
  }),
  tool({
    name: "get_credit_status",
    description: "Obtiene el crédito disponible y la condición de pago del cliente de esta conversación. Indica si un aumento de crédito requeriría aprobación humana.",
    schema: getCreditStatusInput,
    execute: (input, ctx) => getCreditStatus({ ...input, customerId: ctx.customerId }),
    label: () => "Crédito validado",
  }),
  tool({
    name: "get_delivery_options",
    description: "Obtiene las opciones de entrega disponibles (estándar, express) y si requieren aprobación humana.",
    schema: getDeliveryOptionsInput,
    execute: (input) => getDeliveryOptions(input),
    label: () => "Opciones de entrega consultadas",
  }),
  tool({
    name: "get_discount_policy",
    description: "Obtiene los límites de descuento autorizados. Si se pasa requestedPct, devuelve si ese descuento es autónomo, requiere aprobación o no está autorizado. Nunca inventes estos límites.",
    schema: getDiscountPolicyInput,
    execute: (input) => getDiscountPolicy(input),
    label: () => "Política de descuentos consultada",
  }),
  tool({
    name: "prepare_verified_offer",
    description: "Prepara la única oferta comercial verificable: consulta precio oficial, descuento natural y autorizado, precio neto, total, inventario, crédito, entrega y aprobaciones. Solo presenta una oferta firme si devuelve status=ready. Si devuelve approval_required, solicita las aprobaciones indicadas y espera; si devuelve unavailable, no ofrezcas esas condiciones.",
    schema: prepareVerifiedOfferInput,
    execute: (input, ctx) => prepareVerifiedOffer({ ...input, conversationId: ctx.conversationId, customerId: ctx.customerId }),
    label: (_input, result: unknown) => `Oferta verificada: ${(result as { status: string }).status}`,
  }),
  tool({
    name: "request_approval",
    description: "Crea una solicitud de aprobación humana cuando una condición solicitada por el cliente excede la autonomía del agente (descuento, crédito o entrega). No asumas que fue aprobada: solo queda pendiente hasta que un humano decida.",
    schema: requestApprovalInput,
    execute: async (input, ctx) => {
      const result = await requestApproval({ ...input, conversationId: ctx.conversationId, customerId: ctx.customerId });
      // After the transaction commits: the owner is asked on Telegram and their
      // decision makes the agent write to the customer on its own.
      const ownerNotified = await notifyOwnerOfApproval(result.approvalId);
      return { ...result, ownerNotified };
    },
    label: (input) => `Aprobación solicitada: ${input.type}`,
  }),
  tool({
    name: "consult_owner",
    description: "Consulta al dueño por Telegram un caso que excede tu autonomía y que no es una aprobación de descuento, crédito o entrega (una condición especial, una duda comercial que no puedes resolver con las herramientas). Después dile al cliente que lo estás consultando y que le escribes en breve: cuando el dueño responda, el sistema te pedirá escribirle.",
    schema: z.object({ question: z.string().min(10).max(600).describe("La consulta concreta, con los datos que el dueño necesita para decidir.") }),
    execute: async (input, ctx) => {
      const sent = await askOwner(ctx.conversationId, input.question);
      return sent
        ? { sent: true }
        : { sent: false, note: "No hay canal con el dueño. No prometas volver con una respuesta: resuelve dentro de tu autonomía o deja clara la opción disponible." };
    },
    label: (input) => `Consulta al dueño: ${input.question}`.slice(0, 150),
  }),
  tool({
    name: "get_approval_result",
    description: "Consulta el estado actual de una solicitud de aprobación previamente creada (pendiente, aprobada, modificada o rechazada).",
    schema: getApprovalResultInput,
    execute: (input, ctx) => getApprovalResult({ ...input, conversationId: ctx.conversationId }),
    label: (_input, result: unknown) => `Resultado de aprobación: ${(result as { status: string }).status}`,
  }),
  tool({
    name: "create_sandbox_order",
    description: "Crea el pedido en el entorno sandbox una vez que el cliente confirmó explícitamente la oferta resumida y todos los datos (precio, stock, descuento, crédito, entrega) fueron validados. Solo funciona en respuesta directa al mensaje de confirmación del cliente. Revalida todo internamente; no confíes en cifras mencionadas antes en la conversación.",
    schema: createSandboxOrderInput,
    execute: async (input, ctx) => {
      assertOrderAllowed(ctx);
      return createSandboxOrder({ ...input, conversationId: ctx.conversationId, customerId: ctx.customerId });
    },
    label: (_input, result: unknown) => `Pedido sandbox creado: #${(result as { orderId: string }).orderId.slice(0, 8)}`,
  }),
  tool({
    name: "save_customer_insight",
    description: "Guarda los datos estructurados descubiertos en la conversación (motivo de inactividad, objeción, competidor, producto de interés, intención de compra, próxima acción, etc.). Llamar cuando se descubra información relevante, no solo al final.",
    schema: saveCustomerInsightInput,
    execute: (input, ctx) => saveCustomerInsight({ ...input, conversationId: ctx.conversationId, customerId: ctx.customerId }),
    label: (input) => (input.optOut ? "Cliente solicitó no recibir más mensajes (opt-out registrado)" : "Insight del cliente guardado"),
  }),
  tool({
    name: "update_opportunity_stage",
    description: "Actualiza la etapa comercial de la conversación (discovery, objection_handling, negotiating, awaiting_approval, closing, closed). Llamar cada vez que la conversación avanza de etapa.",
    schema: updateOpportunityStageInput,
    execute: (input, ctx) => updateOpportunityStage({ ...input, conversationId: ctx.conversationId }),
    label: (input) => `Etapa actualizada: ${input.stage}`,
  }),
];

const CONTEXT_FIELDS = ["customerId", "conversationId"];

// The model never supplies these — they're injected from ToolContext right
// before validation (see runtime.ts) — so they're stripped from what the
// model sees, both to avoid wasted tokens and to remove any chance of it
// mistyping a UUID or, as happened once in testing, asking the *customer*
// for a conversationId.
function stripContextFields(jsonSchema: Record<string, unknown>): Record<string, unknown> {
  const properties = { ...(jsonSchema.properties as Record<string, unknown> | undefined) };
  for (const field of CONTEXT_FIELDS) delete properties[field];

  const required = Array.isArray(jsonSchema.required)
    ? (jsonSchema.required as string[]).filter((key) => !CONTEXT_FIELDS.includes(key))
    : jsonSchema.required;

  return { ...jsonSchema, properties, required };
}

export function getOpenAiToolDefinitions() {
  return TOOLS.map((t) => ({
    type: "function" as const,
    name: t.name,
    description: t.description,
    parameters: stripContextFields(toJSONSchema(t.schema, { target: "draft-7" }) as Record<string, unknown>),
    strict: false,
  }));
}

export function getTool(name: string): AnyTool | undefined {
  return TOOLS.find((t) => t.name === name);
}
