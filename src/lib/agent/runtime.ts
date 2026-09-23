import "server-only";
import type OpenAI from "openai";
import { sql } from "@/lib/db";
import { getAgentModel, getOpenAiClient } from "@/lib/agent/openai-client";
import { getOpenAiToolDefinitions, getTool, type ToolContext } from "@/lib/agent/tools";
import { logAudit } from "@/lib/agent/audit";
import { isWhatsAppConfigured, sendWhatsAppMessage } from "@/lib/channel/whatsapp-client";
import { toWhatsAppText } from "@/lib/channel/whatsapp-format";
import { isCustomerSuppressed } from "@/lib/agent/contact-permission";
import { FOLLOW_UP_TOTAL, type FollowUpStep } from "@/lib/agent/follow-up-sequence";

type AgentTurnOptions = { isOpeningMessage: boolean; followUp?: FollowUpStep };

const SYSTEM_PROMPT_BASE = `Eres el agente comercial autónomo de Nova Distribution, un distribuidor B2B de productos de cuidado personal. Hablas con clientes por WhatsApp en español, en tono consultivo y profesional, con mensajes cortos (como se escribe en WhatsApp, no párrafos de correo).

Puedes decidir libremente: cómo conversar, qué preguntas hacer para descubrir por qué el cliente dejó de comprar, cómo presentar valor, cómo manejar objeciones y cuándo pedir el cierre.

Lo que NUNCA puedes hacer es inventar: precios, inventario, crédito, descuentos permitidos, condiciones de entrega o de pago. Esos datos siempre vienen de las herramientas — nunca los calcules ni los asumas de memoria.

Reglas obligatorias:
- Antes de mencionar un precio, usa get_product_price. Antes de decir que hay disponibilidad, usa get_inventory. Nunca confirmes una venta sin haber consultado el stock en ese mismo turno.
- Antes de ofrecer o aceptar cualquier descuento, usa get_discount_policy con el porcentaje solicitado. Si la herramienta indica "auto_approve", puedes ofrecerlo tú mismo. Si indica "requires_approval", debes llamar a request_approval y decirle al cliente que necesitas confirmar esa condición — nunca la des por aprobada tú mismo. Si indica "denied", explica que ese porcentaje no es posible y ofrece como máximo el límite autorizable.
- Cualquier crédito nuevo o aumento de crédito requiere request_approval; una condición de crédito ya existente no.
- Cuando descubras información relevante (motivo de inactividad, competidor mencionado, objeción, producto de interés, cantidad, precio objetivo, condición solicitada, intención de compra), guárdala con save_customer_insight — no esperes al final de la conversación.
- Si el cliente pide explícitamente no recibir más mensajes, llama a save_customer_insight con optOut=true inmediatamente. El sistema detendrá el turno sin más envíos; nunca reviertas esa decisión.
- Actualiza la etapa de la conversación con update_opportunity_stage cuando avances de una etapa a otra (discovery, objection_handling, negotiating, awaiting_approval, closing, closed).
- Solo crea el pedido con create_sandbox_order cuando el cliente haya confirmado explícitamente la compra (cantidad, producto y condición claros). Usa creditTerms exacto de la fuente y deliveryHours numérico validado. Los pedidos son sandbox, no pedidos reales ni facturas.
- Nunca muestres tu razonamiento interno, listas de pasos o mención de "herramientas" al cliente: escribe solo el mensaje que un vendedor real enviaría.
- Formato de WhatsApp: para resaltar usa UN solo asterisco (*así*). Nunca uses doble asterisco, encabezados con # ni enlaces en formato Markdown.`;

type ConversationContext = {
  customerId: string;
  opportunityId: string;
  customerName: string;
  customerPhone: string | null;
  segment: string | null;
  reasonText: string | null;
  strategyText: string | null;
};

async function loadConversationContext(conversationId: string): Promise<ConversationContext> {
  const [row] = await sql`
    select
      c.id as customer_id,
      c.name as customer_name,
      c.phone as customer_phone,
      c.segment,
      o.id as opportunity_id,
      o.reason_text,
      o.strategy_text
    from agente_comercial.conversations conv
    join agente_comercial.customers c on c.id = conv.customer_id
    join agente_comercial.opportunities o on o.id = conv.opportunity_id
    where conv.id = ${conversationId}
  `;
  if (!row) throw new Error(`Conversación ${conversationId} no encontrada`);
  return {
    customerId: row.customer_id,
    opportunityId: row.opportunity_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    segment: row.segment,
    reasonText: row.reason_text,
    strategyText: row.strategy_text,
  };
}

function buildSystemPrompt(ctx: ConversationContext, opts: AgentTurnOptions): string {
  return `${SYSTEM_PROMPT_BASE}

Contexto de esta conversación:
- Cliente: ${ctx.customerName}
- Segmento: ${ctx.segment ?? "desconocido"}
- Motivo detectado por el sistema: ${ctx.reasonText ?? "no especificado"}
- Estrategia sugerida: ${ctx.strategyText ?? "no especificada"}

Todas las herramientas ya saben a qué cliente y conversación pertenecen — nunca pidas ni menciones un ID al cliente.

Llama a update_opportunity_stage con un valor breve de nextObjective (qué buscas lograr en el próximo intercambio) cada vez que cambies de etapa.
${
  opts.isOpeningMessage
    ? `\nEsta es la primera vez que contactas a este cliente en esta conversación — todavía no ha dicho nada. Preséntate brevemente en nombre de Nova Distribution y pregunta, de forma natural y consultiva, por qué dejó de comprar. No presentes ofertas todavía.`
    : ""
}${
  opts.followUp
    ? `\nEl cliente no ha respondido tu último mensaje. Escribe el seguimiento ${opts.followUp.step} de ${FOLLOW_UP_TOTAL} ("${opts.followUp.title}"): ${opts.followUp.instruction} Nunca menciones que es un mensaje automático ni cuántos seguimientos van, y no copies frases de tus mensajes anteriores.`
    : ""
}`;
}

const MAX_TOOL_ITERATIONS = 8;

function isFunctionCall(
  item: OpenAI.Responses.ResponseOutputItem,
): item is OpenAI.Responses.ResponseFunctionToolCall {
  return item.type === "function_call";
}

async function loadHistoryAsInput(conversationId: string) {
  const history = await sql`
    select direction, sender, body
    from agente_comercial.messages
    where conversation_id = ${conversationId}
    order by created_at asc
  `;
  return history.map((m) => ({
    role: m.sender === "customer" ? "user" : m.sender === "agent" ? "assistant" : "system",
    content: m.body,
  }));
}

async function executeAgentLoop(
  conversationId: string,
  context: ConversationContext,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialInput: any[],
  opts: AgentTurnOptions,
): Promise<string> {
  // Loosely typed on purpose: the Responses API's input/output item union is
  // large and this loop only ever inspects `.type`, `.call_id`, `.name` and
  // `.arguments` — narrowing to the SDK's exact types isn't worth the churn
  // for those four fields.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let input: any[] = initialInput;

  if (await isCustomerSuppressed(context.customerId)) return "";
  const client = getOpenAiClient();
  const model = getAgentModel();
  const tools = getOpenAiToolDefinitions();
  const toolContext: ToolContext = { conversationId, customerId: context.customerId };
  const instructions = buildSystemPrompt(context, opts);

  let response = await client.responses.create({ model, instructions, input, tools });

  for (let iteration = 0; ; iteration++) {
    const functionCalls = response.output.filter(isFunctionCall);
    if (functionCalls.length === 0) break;
    if (iteration >= MAX_TOOL_ITERATIONS) {
      throw new Error("El agente excedió el límite de pasos de herramientas en un turno.");
    }

    input = input.concat(response.output);

    for (const call of functionCalls) {
      if (await isCustomerSuppressed(context.customerId)) return "";
      const tool = getTool(call.name);
      let outputPayload: unknown;

      if (!tool) {
        outputPayload = { error: `Herramienta desconocida: ${call.name}` };
      } else {
        try {
          const parsedArgs: unknown = JSON.parse(call.arguments || "{}");
          // Belt-and-suspenders: even though the model never sees these
          // fields in the tool schema (see getOpenAiToolDefinitions), force
          // them here too in case a tool's own schema still requires them.
          const argsWithContext =
            typeof parsedArgs === "object" && parsedArgs !== null
              ? { ...parsedArgs, customerId: toolContext.customerId, conversationId: toolContext.conversationId }
              : parsedArgs;
          const validated = tool.schema.parse(argsWithContext);
          const result = await tool.execute(validated, toolContext);
          outputPayload = result;
          await logAudit({
            conversationId,
            category: "tool_call",
            label: tool.label(validated, result),
            payload: { tool: tool.name, input: validated, result },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          outputPayload = { error: message };
          await logAudit({
            conversationId,
            category: "tool_call",
            label: `Error en ${call.name}: ${message}`,
            payload: { tool: call.name, error: message },
          });
        }
      }

      input.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(outputPayload),
      });
    }

    if (await isCustomerSuppressed(context.customerId)) return "";
    response = await client.responses.create({ model, instructions, input, tools });
  }

  const reply = toWhatsAppText(response.output_text ?? "");
  if (await isCustomerSuppressed(context.customerId)) return "";

  await sql`
    insert into agente_comercial.messages (conversation_id, direction, sender, body)
    values (${conversationId}, 'outbound', 'agent', ${reply})
  `;

  // Best-effort real send: a WhatsApp outage must never break the in-app
  // conversation, which already has the message and keeps working either
  // way — so failures are logged, not thrown.
  if (isWhatsAppConfigured() && context.customerPhone && reply) {
    try {
      if (await isCustomerSuppressed(context.customerId)) return "";
      await sendWhatsAppMessage(context.customerPhone, reply);
    } catch (err) {
      await logAudit({
        conversationId,
        category: "system",
        label: `No se pudo enviar el mensaje por WhatsApp real: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  return reply;
}

export async function runAgentTurn(
  conversationId: string,
  customerMessage: string,
  opts: { externalMessageId?: string } = {},
): Promise<{ reply: string }> {
  const [conversation] = await sql`select ended_at from agente_comercial.conversations where id = ${conversationId}`;
  if (!conversation || conversation.ended_at) throw new Error("Conversación no disponible.");
  const [inserted] = await sql`
    insert into agente_comercial.messages (conversation_id, direction, sender, body, external_message_id)
    values (${conversationId}, 'inbound', 'customer', ${customerMessage}, ${opts.externalMessageId ?? null})
    on conflict do nothing
    returning id
  `;
  // Requires the existing DB uniqueness guarantee on external_message_id.
  // Recovery of an inserted-but-unprocessed message still requires the durable inbox.
  if (!inserted) return { reply: "" };

  const context = await loadConversationContext(conversationId);
  const input = await loadHistoryAsInput(conversationId);
  const reply = await executeAgentLoop(conversationId, context, input, { isOpeningMessage: false });
  return { reply };
}

/**
 * Kicks off a brand-new conversation with no prior customer message — the
 * agent makes the first move, per spec section 1 ("El agente inicia una
 * conversación real por WhatsApp"). Nothing is inserted as an inbound
 * message; the "start now" instruction lives only in the system prompt for
 * this one call, never in the persisted chat history.
 */
export async function startConversation(conversationId: string): Promise<{ reply: string }> {
  const context = await loadConversationContext(conversationId);
  const input = [{ role: "user" as const, content: "(inicia la conversación)" }];
  const reply = await executeAgentLoop(conversationId, context, input, { isOpeningMessage: true });
  return { reply };
}

/** Like startConversation, the "customer went quiet" trigger lives only in this call, never in the stored history. */
export async function sendFollowUp(conversationId: string, step: FollowUpStep): Promise<{ reply: string }> {
  const context = await loadConversationContext(conversationId);
  const history = await loadHistoryAsInput(conversationId);
  const input = [...history, { role: "user" as const, content: "(el cliente no ha respondido)" }];
  const reply = await executeAgentLoop(conversationId, context, input, { isOpeningMessage: false, followUp: step });
  return { reply };
}

/**
 * Runs after a human approves/modifies/rejects a pending approval (section
 * 6: "la conversación debe continuar automáticamente" after the decision).
 * `decisionSummary` is a factual, system-written sentence — never something
 * the model wrote about itself — describing exactly what was decided.
 */
export async function resumeAfterHumanDecision(
  conversationId: string,
  decisionSummary: string,
): Promise<{ reply: string }> {
  const context = await loadConversationContext(conversationId);
  const history = await loadHistoryAsInput(conversationId);
  const input = [
    ...history,
    {
      role: "system" as const,
      content: `Un humano acaba de decidir sobre la aprobación pendiente: ${decisionSummary} Continúa la conversación con el cliente reflejando esta decisión de forma natural. Actualiza la etapa con update_opportunity_stage si corresponde.`,
    },
  ];
  const reply = await executeAgentLoop(conversationId, context, input, { isOpeningMessage: false });
  return { reply };
}
