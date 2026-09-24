/**
 * Single source of truth for the Meta-approved templates: the exact body
 * registered in WhatsApp Manager, and the text stored in the chat history
 * when one is sent. Editing a body here requires re-approval in Meta.
 */

export const TEMPLATE_LANGUAGE = "es";

export type OutreachTemplateName =
  | "apertura_recompra"
  | "apertura_reactivacion"
  | "apertura_producto"
  | "seguimiento_valor"
  | "seguimiento_angulo"
  | "seguimiento_cierre";

export type PaymentTemplateName =
  | "cobro_credito"
  | "cobro_contado"
  | "recordatorio_pago"
  | "pago_vence_hoy"
  | "pago_vencido"
  | "pago_recibido";

export type TemplateName = OutreachTemplateName | PaymentTemplateName;

export type WhatsAppTemplate = {
  name: TemplateName;
  /** MARKETING: outreach. UTILITY: about an order the customer placed (no promotion). */
  category: "MARKETING" | "UTILITY";
  purpose: string;
  body: string;
  params: readonly { label: string; example: string }[];
  /** Quick replies (max 3, 20 characters each): one tap is easier than typing. */
  buttons: readonly string[];
  /** URL button whose dynamic suffix is the payment token: <base>/pagar/{{1}}. */
  linkButton?: { text: string; pathPrefix: string; example: string };
  footer: string | null;
};

/** Invites any payment exception into the chat, where the agent routes it to the owner. */
export const PAYMENT_FOOTER = "Si necesita pagar de otra forma, respóndame aquí.";

/** Label and path of the payment button shared by every payment template. */
export const PAYMENT_LINK_BUTTON = { text: "Pagar pedido", pathPrefix: "/pagar/", example: "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6" } as const;

/** Who signs the outreach. Written on his behalf; he decides exceptions on Telegram. */
export const SENDER_NAME = "Abdiel";

/** Meta asks for clear opt-out instructions in marketing messages; "BAJA" is honored by the webhook. */
export const OPT_OUT_FOOTER = "Si no desea más mensajes, responda BAJA.";

// Provisional variants without the contact's first name (not stored yet):
// they greet with "Hola," and name the company inside the sentence.
const OUTREACH_TEMPLATES: Record<OutreachTemplateName, WhatsAppTemplate> = {
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

// Payment templates: UTILITY, because each one is about an order the
// customer placed and confirmed, with no promotion. Utility templates are
// cheaper and do not count against Meta's per-user marketing limit. Their
// only button opens the order's payment link.
const PAYMENT_TEMPLATES: Record<PaymentTemplateName, WhatsAppTemplate> = {
  cobro_credito: {
    name: "cobro_credito",
    category: "UTILITY",
    purpose: "Cobro al confirmar un pedido a crédito: plazo, vencimiento y enlace para pagar cuando convenga.",
    body: "Su pedido #{{1}} de {{2}} quedó registrado con crédito a {{3}}, con vencimiento el {{4}}. Puede pagarlo aquí cuando le convenga, con tarjeta, Yappy o transferencia.",
    params: [
      { label: "Pedido", example: "A1B2C3D4" },
      { label: "Total", example: "$885.00" },
      { label: "Plazo", example: "30 días" },
      { label: "Vencimiento", example: "24 de octubre de 2026" },
    ],
    buttons: [],
    linkButton: PAYMENT_LINK_BUTTON,
    footer: PAYMENT_FOOTER,
  },
  cobro_contado: {
    name: "cobro_contado",
    category: "UTILITY",
    purpose: "Cobro al confirmar un pedido al contado: el despacho se coordina al acreditarse el pago.",
    body: "Para completar su pedido #{{1}} de {{2}}, puede pagarlo aquí con tarjeta, Yappy o transferencia. En cuanto se acredite el pago coordinamos el despacho.",
    params: [
      { label: "Pedido", example: "A1B2C3D4" },
      { label: "Total", example: "$885.00" },
    ],
    buttons: [],
    linkButton: PAYMENT_LINK_BUTTON,
    footer: PAYMENT_FOOTER,
  },
  recordatorio_pago: {
    name: "recordatorio_pago",
    category: "UTILITY",
    purpose: "Recordatorio 1: tres días antes del vencimiento.",
    body: "Hola, le recordamos que el pago de su pedido #{{1}} por {{2}} vence el {{3}}. Puede pagarlo aquí cuando le convenga. Si ya lo realizó, puede ignorar este mensaje.",
    params: [
      { label: "Pedido", example: "A1B2C3D4" },
      { label: "Total", example: "$885.00" },
      { label: "Vencimiento", example: "24 de octubre de 2026" },
    ],
    buttons: [],
    linkButton: PAYMENT_LINK_BUTTON,
    footer: PAYMENT_FOOTER,
  },
  pago_vence_hoy: {
    name: "pago_vence_hoy",
    category: "UTILITY",
    purpose: "Recordatorio 2: el día del vencimiento.",
    body: "Hola, hoy vence el pago de su pedido #{{1}} por {{2}}. Puede pagarlo aquí en un minuto con tarjeta, Yappy o transferencia. Si ya lo realizó, puede ignorar este mensaje.",
    params: [
      { label: "Pedido", example: "A1B2C3D4" },
      { label: "Total", example: "$885.00" },
    ],
    buttons: [],
    linkButton: PAYMENT_LINK_BUTTON,
    footer: PAYMENT_FOOTER,
  },
  pago_vencido: {
    name: "pago_vencido",
    category: "UTILITY",
    purpose: "Recordatorio 3: tres días después del vencimiento; también avisa al dueño.",
    body: "Hola, el pago de su pedido #{{1}} por {{2}} venció el {{3}}. Si ya lo realizó o necesita un plazo adicional, respóndame aquí y lo revisamos con gusto.",
    params: [
      { label: "Pedido", example: "A1B2C3D4" },
      { label: "Total", example: "$885.00" },
      { label: "Vencimiento", example: "24 de octubre de 2026" },
    ],
    buttons: [],
    linkButton: PAYMENT_LINK_BUTTON,
    footer: null,
  },
  pago_recibido: {
    name: "pago_recibido",
    category: "UTILITY",
    purpose: "Confirmación de pago recibido.",
    body: "Recibimos su pago de {{1}} del pedido #{{2}}. ¡Muchas gracias! Coordinamos la entrega de {{3}} unidades de {{4}}.",
    params: [
      { label: "Total", example: "$885.00" },
      { label: "Pedido", example: "A1B2C3D4" },
      { label: "Cantidad", example: "50" },
      { label: "Producto", example: "Shampoo Professional 1L" },
    ],
    buttons: [],
    footer: null,
  },
};

export const WHATSAPP_TEMPLATES: Record<TemplateName, WhatsAppTemplate> = { ...OUTREACH_TEMPLATES, ...PAYMENT_TEMPLATES };

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
