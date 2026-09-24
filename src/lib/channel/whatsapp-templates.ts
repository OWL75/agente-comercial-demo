/**
 * Single source of truth for the Meta-approved templates: the exact body
 * registered in WhatsApp Manager, and the text stored in the chat history
 * when one is sent. Editing a body here requires re-approval in Meta.
 */

export const TEMPLATE_LANGUAGE = "es";

export type TemplateName =
  | "apertura_recompra"
  | "apertura_reactivacion"
  | "apertura_producto"
  | "seguimiento_valor"
  | "seguimiento_angulo"
  | "seguimiento_cierre";

export type WhatsAppTemplate = {
  name: TemplateName;
  category: "MARKETING";
  purpose: string;
  body: string;
  params: readonly { label: string; example: string }[];
  /** Quick replies (max 3, 20 characters each): one tap is easier than typing. */
  buttons: readonly string[];
  footer: string;
};

/** Who signs the outreach. Written on his behalf; he decides exceptions on Telegram. */
export const SENDER_NAME = "Abdiel";

/** Meta asks for clear opt-out instructions in marketing messages; "BAJA" is honored by the webhook. */
export const OPT_OUT_FOOTER = "Si no desea más mensajes, responda BAJA.";

// Provisional variants without the contact's first name (not stored yet):
// they greet with "Hola," and name the company inside the sentence.
export const WHATSAPP_TEMPLATES: Record<TemplateName, WhatsAppTemplate> = {
  apertura_recompra: {
    name: "apertura_recompra",
    category: "MARKETING",
    purpose: "Primer contacto cuando el cliente se atrasó en su recompra habitual: usa su último pedido real.",
    body: `Hola, le escribe ${SENDER_NAME} de Nova Distribution. El último pedido de {{1}} fue de {{2}} unidades de {{3}}, hace {{4}} semanas. ¿Le preparo la misma cantidad para esta semana?`,
    params: [
      { label: "Empresa", example: "Distribuidora Belleza del Istmo" },
      { label: "Cantidad del último pedido", example: "50" },
      { label: "Producto", example: "Shampoo Professional 1L" },
      { label: "Semanas desde ese pedido", example: "6" },
    ],
    buttons: ["Sí, prepárelo", "Ahora no"],
    footer: OPT_OUT_FOOTER,
  },
  apertura_reactivacion: {
    name: "apertura_reactivacion",
    category: "MARKETING",
    purpose: "Primer contacto con un cliente inactivo o cuyo ticket bajó: pregunta qué falló de nuestro lado.",
    body: `Hola, le escribe ${SENDER_NAME} de Nova Distribution. Hace un tiempo {{1}} no nos pide {{2}} y quisiera saber si algo falló de nuestro lado. ¿Fue por precio, por entrega o ya no lo necesitan?`,
    params: [
      { label: "Empresa", example: "Distribuidora Belleza del Istmo" },
      { label: "Producto habitual", example: "Shampoo Professional 1L" },
    ],
    buttons: ["Precio", "Entrega", "Ya no lo necesito"],
    footer: OPT_OUT_FOOTER,
  },
  apertura_producto: {
    name: "apertura_producto",
    category: "MARKETING",
    purpose: "Primer contacto con un cliente que compra a la competencia: ofrece comparar, sin anclar en nuestro precio.",
    body: `Hola, le escribe ${SENDER_NAME} de Nova Distribution. Si hoy {{1}} compra {{2}} con otro proveedor, con gusto le preparo una cotización para que la compare, sin compromiso. ¿Cuántas unidades mueven al mes?`,
    params: [
      { label: "Empresa", example: "Distribuidora Belleza del Istmo" },
      { label: "Producto habitual", example: "Shampoo Professional 1L" },
    ],
    buttons: ["Sí, cotíceme", "Ahora no"],
    footer: OPT_OUT_FOOTER,
  },
  seguimiento_valor: {
    name: "seguimiento_valor",
    category: "MARKETING",
    purpose: "Seguimiento 1 (+2 días hábiles): aporta un dato verificado, disponibilidad para su pedido habitual.",
    body: "Hola, revisé {{1}} y hoy tenemos disponibilidad para su pedido habitual de {{2}} unidades. ¿Le preparo la cotización para que la tenga a mano?",
    params: [
      { label: "Producto habitual", example: "Shampoo Professional 1L" },
      { label: "Cantidad habitual", example: "50" },
    ],
    buttons: ["Sí, cotíceme", "Ahora no"],
    footer: OPT_OUT_FOOTER,
  },
  seguimiento_angulo: {
    name: "seguimiento_angulo",
    category: "MARKETING",
    purpose: "Seguimiento 2 (+7 días): cambia de ángulo hacia la objeción probable, con opciones de un toque.",
    body: "Hola, no quiero insistir de más. Si algo de {{1}} no les convence, me ayuda saber qué es para ver si lo podemos resolver. ¿Es el precio, la entrega o ya están cubiertos?",
    params: [{ label: "Producto habitual", example: "Shampoo Professional 1L" }],
    buttons: ["Precio", "Entrega", "Ya estamos cubiertos"],
    footer: OPT_OUT_FOOTER,
  },
  seguimiento_cierre: {
    name: "seguimiento_cierre",
    category: "MARKETING",
    purpose: "Seguimiento 3 (+14 días): despedida respetuosa que deja un siguiente paso fácil.",
    body: "Hola, dejo aquí el tema de {{1}} para no llenarle el chat. Si más adelante necesita reponer, respóndame este mensaje y lo retomamos. ¿Prefiere que le escriba el próximo mes?",
    params: [{ label: "Producto habitual", example: "Shampoo Professional 1L" }],
    buttons: ["Sí, el próximo mes", "No, gracias"],
    footer: OPT_OUT_FOOTER,
  },
};

/** Default order when the customer never replied; the choice adapts to the conversation otherwise. */
export const FOLLOW_UP_TEMPLATES: Record<number, TemplateName> = {
  1: "seguimiento_valor",
  2: "seguimiento_angulo",
  3: "seguimiento_cierre",
};

export type TemplateChoice = { name: TemplateName; params: string[] };

export function countPlaceholders(body: string): number {
  return new Set(body.match(/\{\{\d+\}\}/g) ?? []).size;
}

/** Meta rejects parameters with line breaks, tabs or more than four consecutive spaces. */
export function sanitizeTemplateParam(value: string): string {
  return value.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim().slice(0, 60);
}

export function renderTemplate(name: TemplateName, params: string[]): string {
  const template = WHATSAPP_TEMPLATES[name];
  const expected = countPlaceholders(template.body);
  if (params.length !== expected) {
    throw new Error(`La plantilla ${name} espera ${expected} parámetros y recibió ${params.length}.`);
  }
  return template.body.replace(/\{\{(\d+)\}\}/g, (_, n: string) => params[Number(n) - 1]);
}

/** Maps the opportunity's detected signal to the opening template that fits it. */
export function openingTemplateForSignal(signalType: string | null): TemplateName {
  switch (signalType) {
    case "recompra_atrasada":
    case "reduccion_frecuencia":
      return "apertura_recompra";
    case "cambio_competidor":
      return "apertura_producto";
    default:
      return "apertura_reactivacion";
  }
}

/** Opt-out button labels: older templates, and Meta's native marketing opt-out if added at registration. */
export function isOptOutButtonText(text: string): boolean {
  return ["no me interesa", "dejar de recibir", "detener promociones", "stop promotions"].includes(text.trim().toLowerCase());
}

/** Only unambiguous written requests stop future outreach automatically. */
export function isExplicitOptOutText(text: string): boolean {
  const normalized = text.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[.!¡¿?]+$/g, "");
  return /^(?:no me interesa|no me (?:escriban|escribas|contacten|contactes)(?: mas)?|dejen? de (?:escribirme|contactarme)|no quiero recibir (?:mas )?mensajes|(?:dame|denme) de baja|baja|stop|unsubscribe)$/.test(normalized);
}
