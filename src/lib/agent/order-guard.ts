/**
 * Deterministic backstop for order creation. It never decides that a sale
 * happened — the model still must recognize an explicit confirmation — it
 * only refuses the cases that can never be one: a turn the customer did not
 * trigger, or a last message that is plainly hesitant or negated.
 */

export type TurnTrigger = "customer_message" | "opening" | "follow_up" | "human_decision";

const NEGATED = /\bno\s+(lo\s+)?confirm(o|amos)\b|\b(todav[ií]a|a[uú]n)\s+no\b|\bno\s+(hagas|hagan|procedas|procedan)\b/;

const HESITANT = new RegExp(
  [
    "pensar(lo)?", "pensando", "revisar(lo)?", "revisando", "consultar(lo)?", "consultando",
    "puede\\s+ser", "tal\\s+vez", "quiz[aá]s?", "suena\\s+bien", "me\\s+parece\\s+bien",
    "te\\s+aviso", "le\\s+aviso", "(te|le|les)\\s+confirmo", "lo\\s+veo", "lo\\s+vemos",
    "podr[ií]amos\\s+probar", "podemos\\s+probar", "probar[ií]a(?:mos)?",
  ].map((p) => `\\b${p}\\b`).join("|"),
);

// "te confirmo" announces a future answer, so it is excluded by the lookbehind.
const EXPLICIT = /(?<!\b(te|le|les|luego|despu[eé]s)\s)\bconfirm(o|amos|ado)\b|\bprocede(r|n)?\b|\badelante\s+con\b|\b(haz|hagan|hazme|m[aá]ndame)\s+el\s+pedido\b|\blo\s+compr(o|amos)\b|\bcerramos\b/;

/** Returns why the last customer message cannot be a purchase confirmation, or null. */
export function explainNonConfirmation(message: string): string | null {
  const text = message.toLowerCase().normalize("NFC");
  if (NEGATED.test(text)) return "el cliente negó o aplazó la confirmación";
  if (HESITANT.test(text) && !EXPLICIT.test(text)) return "el último mensaje del cliente expresa duda, no una confirmación";
  if (!EXPLICIT.test(text)) return "el último mensaje no contiene una confirmación explícita";
  return null;
}

export function assertOrderAllowed(ctx: { trigger: TurnTrigger; customerMessage?: string }): void {
  if (ctx.trigger !== "customer_message" || !ctx.customerMessage) {
    throw new Error(
      "Solo se puede crear el pedido en respuesta directa a un mensaje del cliente que confirme la compra. Informa la situación y pide su confirmación explícita.",
    );
  }
  const reason = explainNonConfirmation(ctx.customerMessage);
  if (reason) {
    throw new Error(
      `No se creó el pedido: ${reason}. Aclara lo que necesita y, cuando corresponda, resume la oferta y pide una confirmación explícita.`,
    );
  }
}
