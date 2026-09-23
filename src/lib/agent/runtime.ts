import "server-only";
import type OpenAI from "openai";
import { sql } from "@/lib/db";
import { getAgentModel, getOpenAiClient } from "@/lib/agent/openai-client";
import { getOpenAiToolDefinitions, getTool, type ToolContext } from "@/lib/agent/tools";
import { logAudit } from "@/lib/agent/audit";
import { isWhatsAppConfigured, sendWhatsAppMessage } from "@/lib/channel/whatsapp-client";
import { toWhatsAppText } from "@/lib/channel/whatsapp-format";
import { isCustomerSuppressed } from "@/lib/agent/contact-permission";
import type { FollowUpStep } from "@/lib/agent/follow-up-sequence";
import { buildSystemPrompt, type AgentTurnOptions } from "@/lib/agent/system-prompt";
import type { TurnTrigger } from "@/lib/agent/order-guard";

type TurnOptions = AgentTurnOptions & { trigger: TurnTrigger; customerMessage?: string };

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
  opts: TurnOptions,
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
  const toolContext: ToolContext = {
    conversationId,
    customerId: context.customerId,
    trigger: opts.trigger,
    customerMessage: opts.customerMessage,
  };
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
  const reply = await executeAgentLoop(conversationId, context, input, {
    isOpeningMessage: false,
    trigger: "customer_message",
    customerMessage,
  });
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
  const reply = await executeAgentLoop(conversationId, context, input, { isOpeningMessage: true, trigger: "opening" });
  return { reply };
}

/** Like startConversation, the "customer went quiet" trigger lives only in this call, never in the stored history. */
export async function sendFollowUp(conversationId: string, step: FollowUpStep): Promise<{ reply: string }> {
  const context = await loadConversationContext(conversationId);
  const history = await loadHistoryAsInput(conversationId);
  const input = [...history, { role: "user" as const, content: "(el cliente no ha respondido)" }];
  const reply = await executeAgentLoop(conversationId, context, input, { isOpeningMessage: false, followUp: step, trigger: "follow_up" });
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
      content: `Un humano acaba de decidir sobre la aprobación pendiente: ${decisionSummary} Continúa la conversación con el cliente reflejando esta decisión de forma natural y, si corresponde, resume la oferta vigente y pide su confirmación explícita: el pedido solo puede crearse cuando el cliente responda confirmando. Actualiza la etapa con update_opportunity_stage si corresponde.`,
    },
  ];
  const reply = await executeAgentLoop(conversationId, context, input, { isOpeningMessage: false, trigger: "human_decision" });
  return { reply };
}
