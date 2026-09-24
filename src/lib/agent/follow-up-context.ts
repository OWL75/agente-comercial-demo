/**
 * What a good salesperson reviews before following up: what the customer
 * last said, what is still pending, what is already known (never re-asked)
 * and what was already sent. Pure functions: the runtime feeds them the
 * stored conversation, the tests feed them real transcripts.
 */
import { OBJECTION_TYPES } from "@/lib/agent/sales-playbook";
import { FOLLOW_UP_TOTAL } from "@/lib/agent/follow-up-sequence";
import type { TemplateName } from "@/lib/channel/whatsapp-templates";

export type FollowUpMessage = { sender: string; body: string; createdAt: Date };

export type FollowUpInsight = {
  motivo_inactividad?: string | null;
  competidor_mencionado?: string | null;
  objecion?: string | null;
  producto_interes?: string | null;
  cantidad?: number | null;
  precio_objetivo?: number | string | null;
  condicion_solicitada?: string | null;
  intencion_compra?: string | null;
  resumen?: string | null;
};

export type FollowUpContext = {
  customerReplied: boolean;
  lastCustomerMessage: string | null;
  hoursSinceCustomer: number | null;
  /** The agent message the customer has not answered (reply to them, or the opening). */
  lastAgentMessage: string | null;
  pendingQuestion: string | null;
  /** Follow-ups already sent since the customer last wrote. */
  previousFollowUps: string[];
  /** Every agent message, to detect repetition. */
  agentMessages: string[];
  known: Array<{ label: string; value: string }>;
  objectionTypes: string[];
  quantityKnown: boolean;
};

export function buildFollowUpContext(
  messages: FollowUpMessage[],
  insight: FollowUpInsight | null,
  now: Date = new Date(),
): FollowUpContext {
  const lastCustomerIndex = messages.map((m) => m.sender).lastIndexOf("customer");
  const lastCustomer = lastCustomerIndex >= 0 ? messages[lastCustomerIndex] : null;
  const agentAfter = messages.slice(lastCustomerIndex + 1).filter((m) => m.sender === "agent");
  const lastAgentMessage = agentAfter[0]?.body ?? null;

  const known: FollowUpContext["known"] = [];
  const add = (label: string, value: unknown) => {
    if (value !== null && value !== undefined && String(value).trim() !== "") known.push({ label, value: String(value) });
  };
  add("Proveedor actual", insight?.competidor_mencionado);
  add("Por qué dejó de comprarnos", insight?.motivo_inactividad);
  add("Objeción", insight?.objecion);
  add("Producto", insight?.producto_interes);
  add("Cantidad", insight?.cantidad);
  add("Precio de referencia del cliente", insight?.precio_objetivo);
  add("Condición que pidió", insight?.condicion_solicitada);
  add("Intención de compra", insight?.intencion_compra);

  return {
    customerReplied: !!lastCustomer,
    lastCustomerMessage: lastCustomer?.body ?? null,
    hoursSinceCustomer: lastCustomer ? Math.max(0, (now.getTime() - lastCustomer.createdAt.getTime()) / 36e5) : null,
    lastAgentMessage,
    pendingQuestion: lastAgentMessage ? lastQuestion(lastAgentMessage) : null,
    previousFollowUps: agentAfter.slice(1).map((m) => m.body),
    agentMessages: messages.filter((m) => m.sender === "agent").map((m) => m.body),
    known,
    objectionTypes: objectionTypesOf(insight?.objecion),
    quantityKnown: typeof insight?.cantidad === "number" && insight.cantidad > 0,
  };
}

export function objectionTypesOf(objecion: string | null | undefined): string[] {
  if (!objecion) return [];
  const found = [...objecion.toLowerCase().matchAll(/([a-záéíóú]+)\s*:/g)].map((m) => m[1]);
  return [...new Set(found.filter((t) => (OBJECTION_TYPES as readonly string[]).includes(t)))];
}

function lastQuestion(text: string): string | null {
  const questions = questionsIn(text);
  return questions.length ? questions[questions.length - 1] : null;
}

function questionsIn(text: string): string[] {
  return [...text.matchAll(/¿[^?¿]*\?|[^.!?¿\n]*\?/g)].map((m) => m[0].trim()).filter((q) => q.length > 3);
}

// ---------------------------------------------------------------------------
// Recommended focus for each touch
// ---------------------------------------------------------------------------

function objectionFocus(ctx: FollowUpContext): string {
  const types = ctx.objectionTypes;
  if (types.includes("servicio") || types.includes("confianza")) {
    return "Su preocupación es el cumplimiento. Consulta get_inventory y get_delivery_options del producto y aporta lo que hoy puedes verificar (disponibilidad, si califica para entrega express) sin prometer más de lo que devuelven. Propón un paso de bajo riesgo, como un pedido de prueba pequeño, solo si mostró algo de interés.";
  }
  if (types.includes("precio")) {
    return ctx.quantityKnown
      ? "Su objeción es el precio y ya conoces su volumen. Ofrece prepararle una comparación concreta para ese volumen (precio, entrega y crédito juntos), sin anticipar descuentos."
      : "Su objeción es el precio. Ofrece prepararle una comparación concreta con su volumen real, que aún no conoces: pregúntalo como parte de esa propuesta, no como interrogatorio. No anticipes descuentos.";
  }
  if (types.includes("autoridad")) {
    return "La decisión es de otra persona. Ofrece enviarle un resumen breve y verificable para quien decide, o pregunta si le sirve que lo retomes después de que lo hablen.";
  }
  if (types.some((t) => ["necesidad", "inventario", "tiempo"].includes(t))) {
    return "Hoy no tiene necesidad. No vendas: pregunta cuándo prevé la próxima reposición para escribirle en ese momento y guarda la fecha si te la da.";
  }
  if (types.includes("presupuesto")) {
    return "El freno es la caja. Recuérdale, si aplica, la condición de crédito que ya tiene (consúltala con get_credit_status) sin prometer ampliaciones.";
  }
  return "Aporta algo útil y concreto relacionado con lo que conversaron.";
}

export function followUpFocus(ctx: FollowUpContext, step: number): string {
  if (step >= FOLLOW_UP_TOTAL) {
    return "Cierra el ciclo con respeto, mencionando su situación en una frase. Di que no vas a insistir, deja la puerta abierta y ofrece escribirle más adelante solo si lo prefiere. Sin culpa ni urgencia.";
  }
  if (!ctx.customerReplied) {
    if (step === 1) return "El cliente no respondió tu apertura. Aporta un dato verificable y útil sobre su producto habitual (disponibilidad, su pedido de siempre) y termina con una propuesta fácil de aceptar, de sí o no. No repitas la pregunta de la apertura.";
    return "Pregunta con naturalidad si cambió la necesidad o si otra persona se encarga ahora de las compras, con opciones fáciles de responder.";
  }
  if (step === 1) {
    const pending = ctx.pendingQuestion
      ? `Retoma el punto que quedó abierto (${ctx.pendingQuestion}) mostrando que recuerdas lo que te dijo, y hazlo más fácil de responder. `
      : "Retoma lo último que te dijo. ";
    return `${pending}${objectionFocus(ctx)}`;
  }
  return "Cambia de ángulo sin repetir los anteriores: un pedido de prueba de bajo riesgo si mostró interés, la persona que decide las compras, o el momento de su próxima reposición. Una sola propuesta.";
}

export function renderFollowUpBrief(ctx: FollowUpContext, step: number): string {
  const quote = (text: string) => `«${text.replace(/\s+/g, " ").trim()}»`;
  const lines: string[] = [];
  if (ctx.customerReplied && ctx.lastCustomerMessage) {
    const hours = ctx.hoursSinceCustomer ?? 0;
    const ago = hours < 1 ? "hace menos de una hora" : hours < 48 ? `hace unas ${Math.round(hours)} horas` : `hace ${Math.round(hours / 24)} días`;
    lines.push(`- Lo último que dijo el cliente (${ago}): ${quote(ctx.lastCustomerMessage)}`);
  } else {
    lines.push("- El cliente todavía no ha respondido nada en esta conversación.");
  }
  if (ctx.lastAgentMessage) lines.push(`- Tu mensaje sin respuesta: ${quote(ctx.lastAgentMessage)}`);
  if (ctx.pendingQuestion) lines.push(`- Pregunta que quedó pendiente: ${quote(ctx.pendingQuestion)}`);
  if (ctx.previousFollowUps.length) {
    lines.push(`- Seguimientos que ya enviaste sin respuesta: ${ctx.previousFollowUps.map(quote).join(" / ")}`);
  }
  if (ctx.known.length) {
    lines.push("- Lo que ya sabes (no lo vuelvas a preguntar):");
    for (const item of ctx.known) lines.push(`  · ${item.label}: ${item.value}`);
  }

  return `Contexto del seguimiento:
${lines.join("\n")}

Enfoque de este seguimiento: ${followUpFocus(ctx, step)}

Cómo escribe un buen vendedor un seguimiento:
- Menciona un detalle concreto de lo que conversaron, para que se note que recuerdas su caso.
- Si el cliente ya respondió, no reabras como contacto en frío: no te vuelvas a presentar y no preguntes si necesita reponer o si está cubierto cuando ya explicó su situación.
- No repitas ni parafrasees de cerca tus mensajes anteriores ni tu pregunta pendiente.
- De una a tres líneas, con una sola pregunta fácil de responder.
- No reproches la falta de respuesta ni inventes urgencia, promociones o datos.
- Evita cifras propias (precio, descuento, total, horas de entrega) en un seguimiento. Si de verdad aportan, solo con prepare_verified_offer en status "ready".`;
}

// ---------------------------------------------------------------------------
// Deterministic review of the model's draft
// ---------------------------------------------------------------------------

export type FollowUpIssue =
  | "empty"
  | "repeats_previous_message"
  | "repeats_previous_question"
  | "cold_reintroduction"
  | "ignores_customer_reply"
  | "reopens_answered_need"
  | "asks_known_information"
  | "guilt_tripping";

export const FOLLOW_UP_ISSUE_EXPLANATIONS: Record<FollowUpIssue, string> = {
  empty: "el borrador está vacío",
  repeats_previous_message: "repite casi textualmente un mensaje que ya enviaste",
  repeats_previous_question: "vuelve a hacer una pregunta que ya hiciste",
  cold_reintroduction: "te vuelves a presentar como si fuera el primer contacto",
  ignores_customer_reply: "habla como si el cliente no hubiera respondido nada",
  reopens_answered_need: "pregunta si necesita reponer o si está cubierto, cuando ya explicó su situación",
  asks_known_information: "pregunta algo que el cliente ya te dijo",
  guilt_tripping: "le reprocha no haber respondido",
};

function words(text: string): Set<string> {
  return new Set(
    text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9]+/).filter((w) => w.length >= 4),
  );
}

export function similarity(a: string, b: string): number {
  const x = words(a);
  const y = words(b);
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared++;
  return shared / (x.size + y.size - shared);
}

const COLD_INTRO = /\b(te|le)\s+escrib[eo]\s+de\s+nova\b|\bsoy\s+\S+(\s+\S+)?\s+de\s+nova\b|\bmi\s+nombre\s+es\b/i;
const IGNORES_REPLY = /\bretomo\s+mi\s+(último\s+|ultimo\s+)?mensaje\b|\bno\s+s[eé]\s+si\s+(viste|vio|leíste|leyó)\b/i;
const REOPENS_NEED = /\b(est[aá]n?\s+cubiert[oa]s?|necesit(an|as)\s+reponer|prev[eé]n?\s+reponer|c[oó]mo\s+van\s+de\s+inventario|cambi[oó]\s+algo\s+en\s+la\s+demanda)\b/i;
const GUILT = /\bno\s+(me\s+)?(has|han|ha)\s+(respondido|contestado)\b|\bsigo\s+esperando\b|\bno\s+he\s+(tenido|recibido)\s+respuesta\b/i;

const KNOWN_QUESTIONS: Array<{ applies: (ctx: FollowUpContext) => boolean; pattern: RegExp }> = [
  { applies: (c) => c.quantityKnown, pattern: /(cu[aá]ntas\s+unidades|qu[eé]\s+cantidad|qu[eé]\s+volumen)/i },
  { applies: (c) => c.known.some((k) => k.label === "Producto"), pattern: /qu[eé]\s+producto/i },
  { applies: (c) => c.known.some((k) => k.label === "Proveedor actual"), pattern: /con\s+qu[eé]\s+proveedor|qui[eé]n\s+(es\s+)?(tu|su)\s+proveedor/i },
  {
    applies: (c) => c.known.some((k) => k.label === "Por qué dejó de comprarnos"),
    pattern: /por\s+qu[eé]\s+(dejaron|dejaste|cambiaron|cambiaste)|qu[eé]\s+(fue\s+lo\s+que\s+)?(influy|motiv)/i,
  },
];

export function followUpReplyIssues(reply: string, ctx: FollowUpContext): FollowUpIssue[] {
  const text = reply.trim();
  if (!text) return ["empty"];
  const issues: FollowUpIssue[] = [];
  if (ctx.agentMessages.some((m) => similarity(text, m) >= 0.6)) issues.push("repeats_previous_message");
  const previousQuestions = ctx.agentMessages.flatMap(questionsIn);
  const ownQuestions = questionsIn(text);
  if (ownQuestions.some((q) => previousQuestions.some((p) => similarity(q, p) >= 0.6))) {
    issues.push("repeats_previous_question");
  }
  if (ctx.customerReplied) {
    if (COLD_INTRO.test(text)) issues.push("cold_reintroduction");
    if (IGNORES_REPLY.test(text)) issues.push("ignores_customer_reply");
    if (ctx.known.length && REOPENS_NEED.test(text)) issues.push("reopens_answered_need");
  }
  if (ownQuestions.some((q) => KNOWN_QUESTIONS.some((k) => k.applies(ctx) && k.pattern.test(q)))) {
    issues.push("asks_known_information");
  }
  if (GUILT.test(text)) issues.push("guilt_tripping");
  return issues;
}

// ---------------------------------------------------------------------------
// Approved-template choice when the 24 h window is closed
// ---------------------------------------------------------------------------

/**
 * Only approved copy can go out, so the choice is among existing templates:
 * price objections get the verified-availability template first, anything
 * else the angle template; never the same template twice. The caller skips a
 * template it lacks data for. null means none fits: skip the touch.
 */
type TemplateArgs = {
  step: number;
  customerReplied: boolean;
  objectionTypes: string[];
  quantityKnown: boolean;
  alreadySent: string[];
};

/** Fitting templates for this touch, best first (the caller may still lack data for one). */
export function followUpTemplateCandidates(args: TemplateArgs): TemplateName[] {
  const unsent = (names: TemplateName[]) => names.filter((n) => !args.alreadySent.includes(n));
  if (args.step >= FOLLOW_UP_TOTAL) return unsent(["seguimiento_cierre"]);
  if (!args.customerReplied) {
    return unsent(args.step === 1 ? ["seguimiento_valor", "seguimiento_angulo"] : ["seguimiento_angulo", "seguimiento_valor"]);
  }
  return unsent(args.objectionTypes.includes("precio")
    ? ["seguimiento_valor", "seguimiento_angulo"]
    : ["seguimiento_angulo", "seguimiento_valor"]);
}

export function chooseFollowUpTemplate(args: TemplateArgs): TemplateName | null {
  return followUpTemplateCandidates(args)[0] ?? null;
}
