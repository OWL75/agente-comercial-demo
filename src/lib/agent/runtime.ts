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
import type { VerifiedOfferResult } from "@/lib/tools/offers";
import { commercialReplyViolations, guardedFallback, presentsFinalVerifiedOffer } from "@/lib/agent/commercial-reply-guard";
import {
  FOLLOW_UP_ISSUE_EXPLANATIONS,
  followUpReplyIssues,
  renderFollowUpBrief,
  type FollowUpContext,
} from "@/lib/agent/follow-up-context";
import { loadFollowUpContext } from "@/lib/agent/follow-up-data";
import { askOwner } from "@/lib/agent/owner-notify";
import { resolveProductRefs } from "@/lib/tools/catalog";
import { isRepetition } from "@/lib/agent/follow-up-context";
import { asksForConfirmation } from "@/lib/agent/commercial-reply-guard";
import { announceOrderToOwner, pendingPaymentFor, sendPaymentRequest } from "@/lib/payments/payments";
import { formatDateEs } from "@/lib/payments/payment-messages";

type TurnOptions = AgentTurnOptions & {
  trigger: TurnTrigger;
  customerMessage?: string;
  followUpContext?: FollowUpContext;
  /** The agent's message just before this customer message. */
  previousAgentMessage?: string;
};

const REPETITION_NOTE = (customerMessage: string) =>
  `(Nota interna del sistema, nunca la menciones al cliente.) Tu respuesta repetía casi textualmente tu mensaje anterior. El cliente ya respondió: «${customerMessage}». Avanza con esa respuesta: si confirmó la oferta presentada, crea el pedido; si pidió algo, respóndelo; nunca le pidas que escriba una frase exacta.`;

const COMMERCIAL_FOLLOW_UP_ISSUE = "incluye precio, descuento, total o entrega sin una oferta verificada";

const UNVERIFIED_TERMS_NOTE = "(Nota interna del sistema, nunca la menciones al cliente.) Tu respuesta incluía precio, descuento, total o entrega sin una oferta verificada, así que no se envió. Verifícala ahora con prepare_verified_offer y responde con el resultado en este mismo mensaje. Si el cliente no dio cantidad, usa como propuesta su cantidad habitual del historial (get_purchase_history) y dilo así. Si algo excede tu autonomía, usa request_approval o consult_owner. Si de verdad falta un dato, pregúntalo sin cifras propias. Nunca digas que lo vas a validar más tarde.";

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
    answeringConfirmationRequest: !!opts.previousAgentMessage && asksForConfirmation(opts.previousAgentMessage),
  };
  const instructions = buildSystemPrompt(context, opts);
  let verifiedOffer: VerifiedOfferResult | null = null;
  let orderCreated = false;
  let createdOrderId: string | null = null;

  // Runs tool calls until the model answers with text; null means the
  // customer opted out mid-turn and nothing more may be sent.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const untilText = async (first: any): Promise<any | null> => {
    let response = first;
    for (let iteration = 0; ; iteration++) {
      const functionCalls = response.output.filter(isFunctionCall);
      if (functionCalls.length === 0) break;
      if (iteration >= MAX_TOOL_ITERATIONS) {
        throw new Error("El agente excedió el límite de pasos de herramientas en un turno.");
      }

      input = input.concat(response.output);

      for (const call of functionCalls) {
        if (await isCustomerSuppressed(context.customerId)) return null;
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
            const validated = tool.schema.parse(await resolveProductRefs(argsWithContext));
            const result = await tool.execute(validated, toolContext);
            outputPayload = result;
            if (tool.name === "prepare_verified_offer") verifiedOffer = result as VerifiedOfferResult;
            if (tool.name === "create_sandbox_order") {
            orderCreated = true;
            createdOrderId = (result as { orderId: string }).orderId;
          }
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

      if (await isCustomerSuppressed(context.customerId)) return null;
      response = await client.responses.create({ model, instructions, input, tools });
    }
    return response;
  };

  let response = await untilText(await client.responses.create({ model, instructions, input, tools }));
  if (!response) return "";
  let reply = toWhatsAppText(response.output_text ?? "");
  if (await isCustomerSuppressed(context.customerId)) return "";

  const hasPendingApproval = async () => {
    const [row] = await sql`
      select id from agente_comercial.approvals
      where conversation_id = ${conversationId} and status = 'pending' limit 1
    `;
    return !!row;
  };
  let pendingApproval = await hasPendingApproval();

  // A follow-up that ignores the conversation is worse than none: the draft
  // gets one rewrite with the reasons, and is dropped if it still fails.
  // It never falls back to the generic commercial text below.
  const followUpContext = opts.followUpContext;
  if (followUpContext) {
    const review = (draft: string) => {
      const issues = followUpReplyIssues(draft, followUpContext).map((i) => FOLLOW_UP_ISSUE_EXPLANATIONS[i]);
      const commercial = commercialReplyViolations({ reply: draft, verifiedOffer, hasPendingApproval: pendingApproval, orderCreated });
      return commercial.length ? [...issues, COMMERCIAL_FOLLOW_UP_ISSUE] : issues;
    };
    let issues = review(reply);
    if (issues.length) {
      await logAudit({
        conversationId,
        category: "system",
        label: `Borrador de seguimiento reescrito: ${issues.join("; ")}`.slice(0, 300),
        payload: { followUpReview: "rewrite", issues, draft: reply },
      });
      input = input.concat(response.output, [{
        role: "user",
        content: `(Nota interna del sistema, nunca la menciones al cliente.) Tu borrador de seguimiento no sirve porque ${issues.join("; ")}. Escríbelo de nuevo usando el contexto del seguimiento y su enfoque.`,
      }]);
      response = await untilText(await client.responses.create({ model, instructions, input, tools }));
      if (!response) return "";
      reply = toWhatsAppText(response.output_text ?? "");
      issues = review(reply);
      if (issues.length) {
        await logAudit({
          conversationId,
          category: "system",
          label: `Seguimiento no enviado: el borrador seguía sin encajar con la conversación (${issues.join("; ")})`.slice(0, 300),
          payload: { followUpReview: "dropped", issues, draft: reply },
        });
        return "";
      }
    }
  }
  const violationsOf = (draft: string) =>
    commercialReplyViolations({ reply: draft, verifiedOffer, hasPendingApproval: pendingApproval, orderCreated });
  let violations = violationsOf(reply);

  // The customer usually won't write again, so "let me validate" must not be a
  // dead end: the agent verifies and answers in this same turn. If it still
  // can't, the owner is consulted on Telegram and their answer resumes the chat.
  if (violations.length && opts.trigger === "customer_message") {
    await logAudit({
      conversationId,
      category: "system",
      label: "Respuesta con condiciones sin verificar: el agente la verifica y la reescribe",
      payload: { violations, draft: reply },
    });
    input = input.concat(response.output, [{ role: "user", content: UNVERIFIED_TERMS_NOTE }]);
    response = await untilText(await client.responses.create({ model, instructions, input, tools }));
    if (!response) return "";
    reply = toWhatsAppText(response.output_text ?? "");
    pendingApproval = await hasPendingApproval();
    violations = violationsOf(reply);
  }

  // Repeating the same offer after the customer answered is how a
  // conversation gets stuck: one rewrite that must move forward.
  if (opts.trigger === "customer_message" && opts.previousAgentMessage &&
      isRepetition(reply, opts.previousAgentMessage)) {
    await logAudit({
      conversationId,
      category: "system",
      label: "Respuesta repetida: el agente la reescribe para avanzar",
      payload: { draft: reply },
    });
    input = input.concat(response.output, [{ role: "user", content: REPETITION_NOTE(opts.customerMessage ?? "") }]);
    response = await untilText(await client.responses.create({ model, instructions, input, tools }));
    if (!response) return "";
    reply = toWhatsAppText(response.output_text ?? "");
    pendingApproval = await hasPendingApproval();
    violations = violationsOf(reply);
  }

  let presentedVerifiedOffer = false;
  if (violations.length) {
    await logAudit({
      conversationId,
      category: "system",
      label: "Respuesta comercial bloqueada por verificación determinística",
      payload: { violations },
    });
    const ownerConsulted = opts.trigger === "customer_message" && !pendingApproval &&
      await askOwner(
        conversationId,
        `No logré armar una oferta verificada para responder al cliente: «${opts.customerMessage ?? ""}». ¿Cómo quieres que siga?`,
      );
    reply = guardedFallback(pendingApproval, ownerConsulted);
  } else presentedVerifiedOffer = presentsFinalVerifiedOffer(reply, verifiedOffer);

  await sql`
    insert into agente_comercial.messages (conversation_id, direction, sender, body)
    values (${conversationId}, 'outbound', 'agent', ${reply})
  `;

  // Record presentation only after the exact customer-visible message exists.
  // create_sandbox_order uses this audit row as its server-side precondition.
  if (presentedVerifiedOffer) {
    await logAudit({
      conversationId,
      category: "policy_check",
      label: "Oferta verificada presentada para confirmación",
      payload: { offer: verifiedOffer },
    });
  }

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

  // Collecting payment needs no human: the payment link goes out as its own
  // message right after the confirmation, and the owner is told on Telegram.
  if (createdOrderId) {
    try {
      await sendPaymentRequest(createdOrderId);
      await announceOrderToOwner(createdOrderId);
    } catch (err) {
      await logAudit({
        conversationId,
        category: "system",
        label: `No se pudo enviar el cobro del pedido: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300),
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
  // A closed sale stays reachable while its payment is pending, so the
  // customer can ask about paying without a human stepping in.
  const pendingPayment = conversation?.ended_at ? await pendingPaymentFor(conversationId) : null;
  if (!conversation || (conversation.ended_at && !pendingPayment)) throw new Error("Conversación no disponible.");
  const [inserted] = await sql`
    insert into agente_comercial.messages (conversation_id, direction, sender, body, external_message_id)
    values (${conversationId}, 'inbound', 'customer', ${customerMessage}, ${opts.externalMessageId ?? null})
    on conflict do nothing
    returning id
  `;
  // Requires the existing DB uniqueness guarantee on external_message_id.
  // Recovery of an inserted-but-unprocessed message still requires the durable inbox.
  if (!inserted) return { reply: "" };

  const [previousAgent] = await sql`
    select body from agente_comercial.messages
    where conversation_id = ${conversationId} and sender = 'agent'
    order by created_at desc limit 1
  `;
  const context = await loadConversationContext(conversationId);
  const input = await loadHistoryAsInput(conversationId);
  const reply = await executeAgentLoop(conversationId, context, input, {
    isOpeningMessage: false,
    trigger: "customer_message",
    customerMessage,
    previousAgentMessage: previousAgent?.body,
    paymentNote: pendingPayment
      ? `El pedido #${pendingPayment.orderShort} ya está creado (${pendingPayment.quantity} × ${pendingPayment.productName}, total ${pendingPayment.total}, ${pendingPayment.terms}, vence el ${formatDateEs(pendingPayment.dueDate)}) y el enlace de pago ya se envió; está pendiente de pago. Ayuda al cliente con el pago sin crear otro pedido ni cambiar condiciones. Si pide el enlace otra vez, usa resend_payment_link. Si quiere pagar de otra forma, fraccionar, más plazo o tiene un problema, usa consult_owner y dile que lo revisas con Abdiel.`
      : undefined,
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
  const followUpContext = await loadFollowUpContext(conversationId);
  const input = [...history, { role: "user" as const, content: "(el cliente no ha respondido)" }];
  const reply = await executeAgentLoop(conversationId, context, input, {
    isOpeningMessage: false,
    followUp: step,
    followUpBrief: renderFollowUpBrief(followUpContext, step.step),
    followUpContext,
    trigger: "follow_up",
  });
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
      content: `Un humano acaba de decidir sobre la aprobación pendiente: ${decisionSummary} El cliente no ha vuelto a escribir: escríbele tú ahora. Empieza diciendo con naturalidad que ya lo consultaste y refleja la decisión. Si quedó aprobada, verifica la oferta con prepare_verified_offer y, si queda ready, preséntala completa y pide su confirmación explícita; si fue rechazada, ofrece la mejor alternativa dentro de tu autonomía. El pedido solo puede crearse cuando el cliente responda confirmando. Actualiza la etapa con update_opportunity_stage si corresponde.`,
    },
  ];
  const reply = await executeAgentLoop(conversationId, context, input, { isOpeningMessage: false, trigger: "human_decision" });
  return { reply };
}

/**
 * Runs when the owner answers a consult_owner question on Telegram. The
 * answer is guidance, not an override: prices, discounts, credit and orders
 * still go through the same tools and policy checks.
 */
export async function resumeAfterOwnerAnswer(
  conversationId: string,
  question: string,
  answer: string,
): Promise<{ reply: string }> {
  const context = await loadConversationContext(conversationId);
  const history = await loadHistoryAsInput(conversationId);
  const input = [
    ...history,
    {
      role: "system" as const,
      content: `Consultaste al dueño: "${question}". Su respuesta: "${answer}". El cliente no ha vuelto a escribir: escríbele tú ahora. Empieza diciendo con naturalidad que ya lo consultaste y lleva la conversación hacia el cierre con esa indicación. Todo precio, descuento, crédito o entrega que menciones debe salir de prepare_verified_offer; si la indicación excede la política, las herramientas lo rechazarán y deberás ofrecer la mejor alternativa permitida. Nunca menciones al dueño por su nombre ni cites su mensaje literal.`,
    },
  ];
  const reply = await executeAgentLoop(conversationId, context, input, { isOpeningMessage: false, trigger: "human_decision" });
  return { reply };
}
