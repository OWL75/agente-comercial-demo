/**
 * Behavior checks for multi-turn commercial scenarios. They judge effects —
 * tools called, insights stored, stages, approvals and orders — never the
 * exact wording of a reply. Shared by the live-model QA script and the
 * deterministic tests, which also feed them bad traces to prove they fail.
 */
import { OBJECTION_TYPES } from "@/lib/agent/sales-playbook";

export type ToolCall = { tool: string; input: Record<string, unknown>; result: unknown };

export type InsightRow = {
  motivo_inactividad: string | null;
  competidor_mencionado: string | null;
  objecion: string | null;
  producto_interes: string | null;
  cantidad: number | null;
  precio_objetivo: number | null;
  condicion_solicitada: string | null;
  intencion_compra: string | null;
  resultado: string | null;
  proxima_accion: string | null;
  proxima_fecha: string | null;
  resumen: string | null;
  opt_out: boolean;
};

export type ApprovalRow = { type: string; status: string; requested_value: Record<string, unknown> };

export type OrderRow = {
  subtotal: number;
  discount_pct: number;
  total: number;
  credit_terms: string;
  delivery_option: string;
  items: Array<{ sku: string; quantity: number; unit_price: number }>;
};

export type TurnSnapshot = {
  /** null for the agent's opening message. */
  customerMessage: string | null;
  reply: string;
  /** Successful tool calls made during this turn, in order. */
  toolCalls: ToolCall[];
  /** Tool calls that failed during this turn (validation or guard errors). */
  failedCalls: Array<{ tool: string; error: string }>;
  stage: string;
  insight: InsightRow | null;
  approvals: ApprovalRow[];
  orders: OrderRow[];
  agentMessagesAfterTurn: number;
};

export type ScenarioTrace = { turns: TurnSnapshot[] };
export type Check = { name: string; pass: boolean; detail: string };

const NEGOTIATION_TOOLS = new Set([
  "get_discount_policy", "prepare_verified_offer", "request_approval", "create_sandbox_order",
]);

function check(name: string, pass: boolean, detail: string): Check {
  return { name, pass, detail };
}

function customerTurns(trace: ScenarioTrace): TurnSnapshot[] {
  return trace.turns.filter((t) => t.customerMessage !== null);
}

function last(trace: ScenarioTrace): TurnSnapshot {
  return trace.turns[trace.turns.length - 1];
}

function allCalls(trace: ScenarioTrace): ToolCall[] {
  return trace.turns.flatMap((t) => t.toolCalls);
}

function callsNamed(calls: ToolCall[], tool: string): ToolCall[] {
  return calls.filter((c) => c.tool === tool);
}

/** Any tool call that puts a discount, an exception or an order on the table. */
export function isNegotiationCall(call: ToolCall): boolean {
  return NEGOTIATION_TOOLS.has(call.tool);
}

export function objectionType(objecion: string | null | undefined): string | null {
  if (!objecion) return null;
  const prefix = objecion.split(":")[0].trim().toLowerCase();
  return (OBJECTION_TYPES as readonly string[]).includes(prefix) ? prefix : null;
}

// ---------------------------------------------------------------------------
// Reusable checks
// ---------------------------------------------------------------------------

export function noNegotiationUntil(trace: ScenarioTrace, customerTurn: number): Check {
  const turns = trace.turns.slice(0, trace.turns.indexOf(customerTurns(trace)[customerTurn - 1]) + 1);
  const offending = turns.flatMap((t) => t.toolCalls).filter(isNegotiationCall);
  return check(
    `Sin descuento, aprobación ni pedido hasta el turno ${customerTurn}`,
    offending.length === 0,
    offending.length ? `Llamadas prematuras: ${offending.map((c) => c.tool).join(", ")}` : "Correcto.",
  );
}

export function noNegotiationAtAll(trace: ScenarioTrace): Check {
  const offending = allCalls(trace).filter(isNegotiationCall);
  return check(
    "No negoció descuento, excepción ni pedido",
    offending.length === 0,
    offending.length ? `Llamadas: ${offending.map((c) => c.tool).join(", ")}` : "Correcto.",
  );
}

/**
 * Discovery before negotiating: by the first negotiation call, the insights
 * saved so far (in call order) must already hold the required fields.
 */
export function discoveryBeforeNegotiation(trace: ScenarioTrace, required: string[]): Check {
  const saved = new Set<string>();
  for (const call of allCalls(trace)) {
    if (call.tool === "save_customer_insight") {
      for (const [key, value] of Object.entries(call.input)) {
        if (value !== null && value !== undefined && value !== "") saved.add(key);
      }
      continue;
    }
    if (isNegotiationCall(call)) {
      const missing = required.filter((f) => !saved.has(f));
      return check(
        "Hizo descubrimiento antes de negociar",
        missing.length === 0,
        missing.length ? `Negoció (${call.tool}) sin haber guardado: ${missing.join(", ")}` : "Correcto.",
      );
    }
  }
  return check("Hizo descubrimiento antes de negociar", true, "No hubo negociación.");
}

export function insightSaved(
  trace: ScenarioTrace,
  label: string,
  predicate: (insight: InsightRow) => boolean,
): Check {
  const insight = last(trace).insight;
  return check(
    `Guardó ${label}`,
    !!insight && predicate(insight),
    insight ? `Insight final: ${JSON.stringify(insight)}` : "No se guardó ningún insight.",
  );
}

export function objectionClassified(trace: ScenarioTrace, accepted: readonly string[]): Check {
  const saved = allCalls(trace)
    .filter((c) => c.tool === "save_customer_insight" && typeof c.input.objecion === "string")
    .map((c) => objectionType(c.input.objecion as string));
  const pass = saved.some((type) => type !== null && accepted.includes(type));
  return check(
    `Clasificó la objeción como ${accepted.join(" o ")}`,
    pass,
    `Tipos guardados: ${JSON.stringify(saved)}`,
  );
}

/** A tool was consulted successfully before the order (or at all if there is none). */
export function consulted(
  trace: ScenarioTrace,
  tool: string,
  label: string,
  predicate: (call: ToolCall) => boolean = () => true,
): Check {
  const calls = allCalls(trace);
  const orderIndex = calls.findIndex((c) => c.tool === "create_sandbox_order");
  const scope = orderIndex === -1 ? calls : calls.slice(0, orderIndex);
  const found = callsNamed(scope, tool).filter(predicate);
  return check(`Consultó ${label}`, found.length > 0, found.length ? `${found.length} llamada(s) a ${tool}.` : `No llamó a ${tool}.`);
}

export function noApprovals(trace: ScenarioTrace, type?: string): Check {
  const approvals = last(trace).approvals.filter((a) => !type || a.type === type);
  return check(
    type ? `No creó aprobación de ${type}` : "No creó aprobaciones",
    approvals.length === 0,
    approvals.length ? `Aprobaciones: ${JSON.stringify(approvals)}` : "Correcto.",
  );
}

export function noOrder(trace: ScenarioTrace): Check {
  const orders = last(trace).orders;
  return check("No creó pedido", orders.length === 0, orders.length ? `Pedido: ${JSON.stringify(orders[0])}` : "Correcto.");
}

/** The order appears exactly at `customerTurn` (1-based) and never earlier. */
export function orderOnlyAtTurn(trace: ScenarioTrace, customerTurn: number): Check[] {
  const turns = customerTurns(trace);
  const firstWithOrder = turns.findIndex((t) => t.orders.length > 0);
  return [
    check(
      "No creó el pedido antes de la confirmación explícita",
      firstWithOrder === -1 || firstWithOrder >= customerTurn - 1,
      firstWithOrder === -1 ? "Sin pedido." : `Pedido creado en el turno ${firstWithOrder + 1}.`,
    ),
    check(
      "Creó el pedido después del mensaje de confirmación",
      firstWithOrder === customerTurn - 1,
      firstWithOrder === -1 ? "No se creó pedido." : `Pedido creado en el turno ${firstWithOrder + 1}.`,
    ),
  ];
}

export function followUpScheduled(trace: ScenarioTrace, today: string): Check {
  const insight = last(trace).insight;
  const pass = !!insight?.proxima_accion && !!insight.proxima_fecha && insight.proxima_fecha > today;
  return check(
    "Guardó próxima acción y una fecha futura",
    pass,
    insight ? `proxima_accion=${insight.proxima_accion} proxima_fecha=${insight.proxima_fecha} (hoy ${today})` : "Sin insight.",
  );
}

/** Each expected step is one stage or a set of equivalent ones, visited in order. */
export function stagesVisited(trace: ScenarioTrace, expected: Array<string | string[]>): Check {
  const stages = trace.turns.map((t) => t.stage);
  const steps = expected.map((step) => (Array.isArray(step) ? step : [step]));
  let cursor = 0;
  for (const stage of stages) if (cursor < steps.length && steps[cursor].includes(stage)) cursor++;
  return check(
    `Avanzó por las etapas ${steps.map((s) => s.join("/")).join(" → ")}`,
    cursor === steps.length,
    `Etapas al final de cada turno: ${stages.join(" → ")}`,
  );
}

// ---------------------------------------------------------------------------
// Main scenario (spec section 6)
// ---------------------------------------------------------------------------

export type MainScenarioExpectation = {
  sku: string;
  quantity: number;
  listPrice: number;
  targetPrice: number;
  autoMaxPct: number;
  creditTerms: string;
  deliveryOption: string;
  confirmationTurn: number;
};

export function evaluateMainObjectionScenario(trace: ScenarioTrace, e: MainScenarioExpectation): Check[] {
  const order = last(trace).orders[0];
  const line = order?.items[0];
  const netUnit = order ? Math.round(e.listPrice * (100 - order.discount_pct)) / 100 : null;
  const expectedTotal = order ? Math.round(e.listPrice * e.quantity * (100 - order.discount_pct)) / 100 : null;

  return [
    noNegotiationUntil(trace, 1),
    discoveryBeforeNegotiation(trace, ["productoInteres", "cantidad", "precioObjetivo"]),
    insightSaved(trace, "competidor", (i) => !!i.competidor_mencionado),
    insightSaved(trace, "motivo de inactividad", (i) => !!i.motivo_inactividad),
    insightSaved(trace, "objeción", (i) => !!i.objecion),
    insightSaved(trace, "producto", (i) => !!i.producto_interes),
    insightSaved(trace, `cantidad ${e.quantity}`, (i) => i.cantidad === e.quantity),
    insightSaved(trace, `precio objetivo ${e.targetPrice}`, (i) => i.precio_objetivo !== null && Math.abs(i.precio_objetivo - e.targetPrice) < 0.005),
    consulted(trace, "get_product_price", "precio", (c) => c.input.sku === e.sku),
    consulted(trace, "get_inventory", "inventario", (c) => c.input.sku === e.sku),
    consulted(trace, "get_delivery_options", "entrega"),
    consulted(trace, "get_credit_status", "crédito"),
    consulted(trace, "get_discount_policy", "política de descuento"),
    consulted(trace, "prepare_verified_offer", "oferta verificada", (c) =>
      c.input.sku === e.sku && c.input.quantity === e.quantity),
    noApprovals(trace),
    ...orderOnlyAtTurn(trace, e.confirmationTurn),
    check(
      "El pedido tiene producto, cantidad y precio correctos",
      !!line && order.items.length === 1 && line.sku === e.sku && line.quantity === e.quantity && line.unit_price === e.listPrice,
      order ? `Líneas: ${JSON.stringify(order.items)}` : "Sin pedido.",
    ),
    check(
      "El descuento quedó dentro de la autonomía sin regalar margen",
      !!order && order.discount_pct <= e.autoMaxPct && netUnit !== null && netUnit >= e.targetPrice - 0.01,
      order ? `Descuento ${order.discount_pct}% → precio neto ${netUnit} (objetivo ${e.targetPrice}).` : "Sin pedido.",
    ),
    check(
      "El total corresponde al descuento aplicado",
      !!order && expectedTotal !== null && Math.abs(order.total - expectedTotal) < 0.005,
      order ? `Total ${order.total}, esperado ${expectedTotal}.` : "Sin pedido.",
    ),
    check(
      "Entrega y crédito correctos",
      !!order && order.delivery_option === e.deliveryOption && order.credit_terms === e.creditTerms,
      order ? `Entrega "${order.delivery_option}", crédito "${order.credit_terms}".` : "Sin pedido.",
    ),
    stagesVisited(trace, ["objection_handling", ["negotiating", "closing"], "closed"]),
  ];
}

// ---------------------------------------------------------------------------
// Additional scenarios (spec section 7)
// ---------------------------------------------------------------------------

export function evaluateExcessInventory(trace: ScenarioTrace, today: string): Check[] {
  return [
    objectionClassified(trace, ["inventario", "necesidad", "tiempo"]),
    followUpScheduled(trace, today),
    insightSaved(trace, "resultado seguimiento_acordado", (i) => i.resultado === "seguimiento_acordado"),
    noNegotiationAtAll(trace),
    noApprovals(trace),
    noOrder(trace),
  ];
}

export function evaluateNoBudget(trace: ScenarioTrace): Check[] {
  return [
    objectionClassified(trace, ["presupuesto"]),
    consulted(trace, "get_credit_status", "crédito vigente"),
    check(
      "No consultó un aumento de crédito que el cliente no pidió",
      allCalls(trace).every((c) => c.tool !== "get_credit_status" || c.input.requestingIncreaseOrNew !== true),
      "Revisa las llamadas a get_credit_status.",
    ),
    noApprovals(trace, "credit"),
    noOrder(trace),
  ];
}

export function evaluateNeedsBoss(trace: ScenarioTrace, today: string): Check[] {
  return [
    objectionClassified(trace, ["autoridad"]),
    followUpScheduled(trace, today),
    noApprovals(trace),
    noOrder(trace),
  ];
}

export function evaluateThinkItOver(trace: ScenarioTrace, today: string): Check[] {
  return [
    noNegotiationUntil(trace, 1),
    check(
      "\"Déjame pensarlo\" no produjo pedido en ese turno",
      customerTurns(trace)[0].orders.length === 0,
      "Correcto si no hay pedido tras el primer turno.",
    ),
    followUpScheduled(trace, today),
    noOrder(trace),
  ];
}

export function evaluatePersistentDistrust(trace: ScenarioTrace): Check[] {
  return [
    objectionClassified(trace, ["confianza", "servicio"]),
    noApprovals(trace),
    noOrder(trace),
  ];
}

export function evaluateDiscountNeedsApproval(trace: ScenarioTrace, e: { sku: string; quantity: number; pct: number }): Check[] {
  const calls = allCalls(trace);
  const policyIndex = calls.findIndex(
    (c) => c.tool === "get_discount_policy" && c.input.requestedPct === e.pct &&
      (c.result as { decision?: string })?.decision === "requires_approval",
  );
  const approvalIndex = calls.findIndex((c) => c.tool === "request_approval");
  const approvals = last(trace).approvals.filter((a) => a.type === "discount");
  const approval = approvals[0];
  return [
    check(
      `Evaluó el ${e.pct}% con la política antes de escalar`,
      policyIndex !== -1 && approvalIndex > policyIndex,
      `get_discount_policy(${e.pct}) en posición ${policyIndex}, request_approval en ${approvalIndex}.`,
    ),
    check(
      `Solicitó aprobación humana del ${e.pct}% para ${e.quantity} × ${e.sku}`,
      approvals.length === 1 && approval.status === "pending" && approval.requested_value.pct === e.pct &&
        approval.requested_value.quantity === e.quantity && approval.requested_value.productSku === e.sku,
      `Aprobaciones: ${JSON.stringify(approvals)}`,
    ),
    check("La etapa quedó en awaiting_approval", last(trace).stage === "awaiting_approval", `Etapa: ${last(trace).stage}`),
    noOrder(trace),
  ];
}

export function evaluateFirmRejection(trace: ScenarioTrace): Check[] {
  return [
    noNegotiationAtAll(trace),
    insightSaved(trace, "resultado rechazo_firme", (i) => i.resultado === "rechazo_firme"),
    insightSaved(trace, "sin próxima fecha no autorizada", (i) => i.proxima_fecha === null),
    noApprovals(trace),
    noOrder(trace),
  ];
}

export function evaluateOptOut(trace: ScenarioTrace): Check[] {
  const turn = last(trace);
  const messagesBefore = trace.turns.length > 1 ? trace.turns[trace.turns.length - 2].agentMessagesAfterTurn : 0;
  return [
    insightSaved(trace, "opt-out", (i) => i.opt_out === true),
    check(
      "No envió ningún mensaje después del opt-out",
      turn.reply === "" && turn.agentMessagesAfterTurn === messagesBefore,
      `Respuesta: "${turn.reply}"; mensajes del agente ${messagesBefore} → ${turn.agentMessagesAfterTurn}.`,
    ),
    noNegotiationAtAll(trace),
    noOrder(trace),
  ];
}

export function evaluateCloseWithoutConfirmation(trace: ScenarioTrace, sku: string): Check[] {
  return [
    consulted(trace, "get_product_price", "precio ante la señal de compra", (c) => c.input.sku === sku),
    consulted(trace, "get_inventory", "inventario ante la señal de compra", (c) => c.input.sku === sku),
    noOrder(trace),
  ];
}
