/**
 * What the owner reads on Telegram and how their taps and replies are read
 * back. Pure: no network, no database. Messages are plain text (no Telegram
 * Markdown), so customer names or quotes can never break the formatting.
 */
import { quoteByNetPrice, quoteMoney } from "@/lib/policy/verified-offer";

const pctLabel = (pct: number) => `${Number(pct.toFixed(2))}%`;

export type OwnerAction = "approve" | "reject" | "ask_value";

const ACTION_PREFIX: Record<OwnerAction, string> = { approve: "ap", reject: "rj", ask_value: "mv" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Telegram limits callback_data to 64 bytes ("ap:" + UUID + ":" + value fits).
 * The value shown on the button travels with it, so an old button can never
 * approve a request whose value changed afterwards.
 */
export function callbackData(action: OwnerAction, approvalId: string, value?: number | null): string {
  return `${ACTION_PREFIX[action]}:${approvalId}${value != null ? `:${value}` : ""}`;
}

export function parseCallbackData(data: string): { action: OwnerAction; approvalId: string; value: number | null } | null {
  const [prefix, id, raw] = data.split(":");
  const action = (Object.keys(ACTION_PREFIX) as OwnerAction[]).find((a) => ACTION_PREFIX[a] === prefix);
  const value = raw == null ? null : Number(raw);
  if (!action || !id || !UUID.test(id) || (value != null && !Number.isFinite(value))) return null;
  return { action, approvalId: id, value };
}

/** First number in the owner's reply: "7", "7%", "dale 7 por ciento", "48 horas", "1,500". */
export function parseOwnerValue(text: string): number | null {
  const match = text.replace(/(\d),(\d{3})\b/g, "$1$2").match(/\d+(?:[.,]\d+)?/);
  if (!match) return null;
  const value = Number(match[0].replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function digitsOnly(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** Panama numbers may arrive with or without the 507 country code. */
export function samePhone(a: string, b: string): boolean {
  const x = digitsOnly(a);
  const y = digitsOnly(b);
  if (!x || !y) return false;
  const local = (d: string) => (d.startsWith("507") && d.length === 11 ? d.slice(3) : d);
  return local(x) === local(y);
}

const money = (value: number) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export type ApprovalForOwner = {
  customerName: string;
  type: string;
  requestedValue: { pct?: number; amount?: number; hours?: number; description?: string; quantity?: number | null; productSku?: string | null };
  context: {
    productName?: string | null;
    unitPrice?: number | null;
    stockAvailable?: number | null;
    creditAvailable?: number | null;
    autonomyMaxPct?: number | null;
    reason?: string | null;
  };
  policyMax: number | null;
  agentRecommendation: string | null;
  creditTerms?: string | null;
  lastCustomerMessage: string | null;
};

function requestLine(a: ApprovalForOwner): string {
  const qty = a.requestedValue.quantity;
  const product = a.context.productName ?? a.requestedValue.productSku ?? "producto";
  const item = qty ? `${qty} × ${product}` : product;
  switch (a.type) {
    case "discount":
      return `${pctLabel(a.requestedValue.pct ?? 0)} de descuento en ${item}`;
    case "credit":
      return `${money(a.requestedValue.amount ?? 0)} de crédito adicional para ${item}`;
    case "delivery":
      return `entrega en ${a.requestedValue.hours} horas para ${item}`;
    default:
      return a.requestedValue.description ?? "una excepción";
  }
}

export function approvalValueLabel(type: string, value: number): string {
  if (type === "discount") return pctLabel(value);
  if (type === "credit") return money(value);
  if (type === "delivery") return `${value} h`;
  return String(value);
}

export function formatApprovalForOwner(a: ApprovalForOwner): string {
  const lines = [`Necesito tu OK para ${a.customerName}`, "", `Pide: ${requestLine(a)}`];
  const { unitPrice, stockAvailable, creditAvailable, autonomyMaxPct } = a.context;
  const qty = a.requestedValue.quantity;
  if (a.type === "discount" && unitPrice && qty && typeof a.requestedValue.pct === "number") {
    const pct = a.requestedValue.pct;
    // A price-negotiated ask carries a derived percentage (e.g. 5.4054% = $17.50).
    const q = Number.isInteger(pct)
      ? quoteMoney(unitPrice, qty, pct)
      : quoteByNetPrice(unitPrice, qty, Math.round(unitPrice * (100 - pct)) / 100);
    lines.push(`Precio: ${money(q.listUnitPrice)} → ${money(q.netUnitPrice)} c/u · total ${money(q.total)} (sin descuento ${money(q.subtotal)})`);
  } else if (unitPrice) {
    lines.push(`Precio de lista: ${money(unitPrice)} c/u`);
  }
  if (a.type === "discount" && autonomyMaxPct != null) {
    lines.push(`Yo puedo dar hasta ${autonomyMaxPct}%${a.policyMax != null ? ` · con tu OK hasta ${a.policyMax}%` : ""}`);
  }
  const facts = [
    stockAvailable != null ? `stock ${stockAvailable}` : null,
    creditAvailable != null ? `crédito disponible ${money(creditAvailable)}${a.creditTerms ? ` (${a.creditTerms})` : ""}` : null,
  ].filter(Boolean);
  if (facts.length) lines.push(`Datos: ${facts.join(" · ")}`);
  if (a.context.reason) lines.push(`Por qué lo pide: ${a.context.reason}`);
  if (a.agentRecommendation) lines.push(`Mi recomendación: ${a.agentRecommendation}`);
  if (a.lastCustomerMessage) lines.push("", `Último mensaje del cliente: «${a.lastCustomerMessage}»`);
  lines.push("", "Cuando decidas, le escribo al cliente de inmediato.");
  return lines.join("\n");
}

export function approvalButtons(approvalId: string, type: string, requested: number | null) {
  const approveLabel = requested != null ? `✅ Aprobar ${approvalValueLabel(type, requested)}` : "✅ Aprobar";
  return {
    inline_keyboard: [
      [{ text: approveLabel, callback_data: callbackData("approve", approvalId, requested) }, { text: "❌ Rechazar", callback_data: callbackData("reject", approvalId) }],
      ...(type === "other" ? [] : [[{ text: "✏️ Otro valor", callback_data: callbackData("ask_value", approvalId) }]]),
    ],
  };
}

/** Everything the owner needs to decide without opening the panel. */
export type OwnerCase = {
  customerName: string;
  /** Why they left / what they object to, as recorded during the chat. */
  objection: string | null;
  competitorPrice: number | null;
  competitorCondition: string | null;
  /** Verified account facts (get_value_proposition), the case for staying with Nova. */
  accountFacts: string[];
  lastOffer: { productName: string; quantity: number; netUnitPrice: number; listUnitPrice: number; total: number } | null;
  floorUnitPrice: number | null;
  recentMessages: Array<{ sender: "customer" | "agent"; body: string }>;
};

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/** "precio: considera insuficiente…" → "considera insuficiente…" (the type prefix is internal). */
function objectionDetail(objection: string): string {
  const detail = objection.replace(/^\s*[a-záéíóú]+\s*:\s*/i, "").trim();
  return detail ? detail[0].toUpperCase() + detail.slice(1) : objection;
}

/**
 * What the agent would do next with the margin it has, so the owner can
 * answer with a word instead of working the numbers out.
 */
export function suggestNextMove(c: Pick<OwnerCase, "lastOffer" | "floorUnitPrice">): string | null {
  if (!c.lastOffer || c.floorUnitPrice == null) return null;
  if (c.lastOffer.netUnitPrice - c.floorUnitPrice > 0.004) {
    return `bajar a ${money(c.floorUnitPrice)} por unidad, que es lo más bajo que puedo sin tu OK, y explicarle por qué le conviene seguir con nosotros más allá del precio.`;
  }
  return `sostener ${money(c.lastOffer.netUnitPrice)}, que ya es mi tope, y proponerle un pedido de prueba. Si quieres bajar más, dime a cuánto.`;
}

export function formatCaseForOwner(c: OwnerCase, ask: { question: string; draft?: string | null }): string {
  const lines = [`${c.customerName}: necesito tu criterio`, "", ask.question];

  const situation = [
    c.objection ? `Qué pasa: ${objectionDetail(c.objection)}` : null,
    c.competitorPrice != null
      ? `Su proveedor actual: ${money(c.competitorPrice)} c/u${c.competitorCondition ? ` · ${c.competitorCondition}` : ""}`
      : null,
    c.lastOffer
      ? `Le ofrecí: ${money(c.lastOffer.netUnitPrice)} c/u × ${c.lastOffer.quantity} ${c.lastOffer.productName} = ${money(c.lastOffer.total)} (lista ${money(c.lastOffer.listUnitPrice)})`
      : null,
    c.floorUnitPrice != null ? `Mi margen: puedo llegar a ${money(c.floorUnitPrice)} c/u sin tu OK` : null,
  ].filter((line): line is string => !!line);
  if (situation.length) lines.push("", ...situation);

  if (c.accountFacts.length) lines.push("", "A nuestro favor:", ...c.accountFacts.map((fact) => `• ${fact}`));

  if (c.recentMessages.length) {
    lines.push("", "La conversación:");
    for (const m of c.recentMessages) lines.push(`${m.sender === "customer" ? "Cliente" : "Nosotros"}: ${clip(m.body, 220)}`);
  }

  const suggestion = suggestNextMove(c);
  if (suggestion) lines.push("", `Lo que yo haría: ${suggestion}`);
  if (ask.draft) lines.push("", `Lo que pensaba responderle: «${clip(ask.draft, 400)}»`);

  lines.push("", "Respóndeme aquí con lo que decidas (por ejemplo «dale el mejor precio», «mantén el precio» o «déjalo para la otra semana») y le escribo al cliente.");
  // Telegram's hard limit is 4096 characters.
  return clip(lines.join("\n"), 4000);
}

export function formatQuestionForOwner(args: { customerName: string; question: string; lastCustomerMessage: string | null }): string {
  return [
    `Consulta sobre ${args.customerName}`,
    "",
    args.question,
    ...(args.lastCustomerMessage ? ["", `Último mensaje del cliente: «${args.lastCustomerMessage}»`] : []),
    "",
    "Responde a este mensaje con tu indicación y se la paso al cliente.",
  ].join("\n");
}
