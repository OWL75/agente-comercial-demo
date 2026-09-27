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
    "considerar(lo|la)?", "considerando", "evaluar(lo|la)?", "evaluando", "ver[ée]",
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

// A plain "sí" is an explicit confirmation when it answers "¿Confirma el pedido?".
const AFFIRMATIVE = /^\s*(s[ií]+|claro|dale|ok(ay)?|de\s+acuerdo|perfecto|listo|correcto|as[ií]\s+es|est[aá]\s+bien|va|excelente)(?=$|[\s,.;:!¡?¿])/;

/**
 * Why the last customer message cannot confirm the order, or null. When the
 * previous agent message asked to confirm a presented offer, a short plain
 * affirmative counts; hesitation and negation never do.
 */
export function explainNonConfirmationInContext(message: string, answeringConfirmationRequest: boolean): string | null {
  const reason = explainNonConfirmation(message);
  if (!reason || !answeringConfirmationRequest) return reason;
  const text = message.toLowerCase().normalize("NFC");
  if (NEGATED.test(text) || HESITANT.test(text)) return reason;
  return AFFIRMATIVE.test(text) ? null : reason;
}

// "Si consigo que Abdiel me apruebe $17.50, ¿le dejo listo el pedido?"
const CONDITIONAL_CLOSE = /\bsi\s+(?:le\s+)?(?:consigo|logro|me\s+aprueban|abdiel\s+(?:me\s+)?(?:lo\s+)?aprueba|lo\s+consigo)\b[^?]*\?|\ben\s+firme\b[^?]*\?/i;
// "Si me lo dejas en 17.50 te lo compro", "trato hecho", "cerramos".
const PURCHASE_INTENT = /\b(?:te|le|se|l[oa]s?)\s+(?:l[oa]s?\s+)?compr(?:o|amos)\b|\bcompr(?:o|amos)\s+(?:l[oa]s\s+)?\d+|\bme\s+l[oa]s?\s+llevo\b|\btrato\s+hecho\b|\bcerramos\b|\b(?:te|le)\s+hago\s+el\s+pedido\b|\bhago\s+el\s+pedido\b|\bconfirm(?:o|amos)\b|\b(?:es|va)\s+en\s+firme\b/;

/**
 * Whether the customer committed to buy if the special condition is approved:
 * a purchase stated outright ("si me lo dejas en 17.50 te lo compro") or a
 * plain yes to the agent's conditional close. "Puedo considerarlo" is not.
 */
export function customerCommitted(customerMessage: string, previousAgentMessage: string | null): boolean {
  const text = customerMessage.toLowerCase().normalize("NFC");
  if (NEGATED.test(text) || HESITANT.test(text)) return false;
  if (PURCHASE_INTENT.test(text)) return true;
  return !!previousAgentMessage && CONDITIONAL_CLOSE.test(previousAgentMessage) && AFFIRMATIVE.test(text);
}

export function assertOrderAllowed(ctx: { trigger: TurnTrigger; customerMessage?: string; answeringConfirmationRequest?: boolean }): void {
  if (ctx.trigger !== "customer_message" || !ctx.customerMessage) {
    throw new Error(
      "Solo se puede crear el pedido en respuesta directa a un mensaje del cliente que confirme la compra. Informa la situación y pide su confirmación explícita.",
    );
  }
  const reason = explainNonConfirmationInContext(ctx.customerMessage, ctx.answeringConfirmationRequest === true);
  if (reason) {
    throw new Error(
      `No se creó el pedido: ${reason}. Aclara lo que necesita y, cuando corresponda, resume la oferta y pide una confirmación explícita.`,
    );
  }
}
