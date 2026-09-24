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
  | "seguimiento_recordatorio"
  | "seguimiento_valor"
  | "seguimiento_angulo"
  | "seguimiento_cierre";

export type WhatsAppTemplate = {
  name: TemplateName;
  category: "MARKETING";
  purpose: string;
  body: string;
  params: readonly { label: string; example: string }[];
};

export const WHATSAPP_TEMPLATES: Record<TemplateName, WhatsAppTemplate> = {
  apertura_recompra: {
    name: "apertura_recompra",
    category: "MARKETING",
    purpose: "Primer contacto cuando el cliente se atrasó en su recompra habitual.",
    body: "Hola {{1}}, te escribo de Nova Distribution por {{2}}. Como solemos coordinar su reposición, quería saber cómo van de inventario esta semana. ¿Cambió algo en la demanda o necesitan reponer pronto?",
    params: [
      { label: "Cliente", example: "Empresa Demo" },
      { label: "Producto habitual", example: "Shampoo Professional 1L" },
    ],
  },
  apertura_reactivacion: {
    name: "apertura_reactivacion",
    category: "MARKETING",
    purpose: "Primer contacto con un cliente inactivo o cuyo ticket bajó.",
    body: "Hola {{1}}, te escribo de Nova Distribution. Hace un tiempo no coordinamos un pedido de {{2}}. ¿Siguen trabajando con ese producto o cambió la necesidad?",
    params: [
      { label: "Cliente", example: "Empresa Demo" },
      { label: "Producto habitual", example: "Shampoo Professional 1L" },
    ],
  },
  apertura_producto: {
    name: "apertura_producto",
    category: "MARKETING",
    purpose: "Primer contacto con un cliente que se fue a la competencia: abre con el precio real del producto.",
    body: "Hola {{1}}, te escribo de Nova Distribution. Tenemos {{2}} a {{3}} por unidad. Si estás comparando opciones para tu próximo pedido, ¿qué cantidad tienes en mente?",
    params: [
      { label: "Cliente", example: "Empresa Demo" },
      { label: "Producto habitual", example: "Shampoo Professional 1L" },
      { label: "Precio unitario vigente", example: "$18.50" },
    ],
  },
  seguimiento_recordatorio: {
    name: "seguimiento_recordatorio",
    category: "MARKETING",
    purpose: "Seguimiento 1: recordatorio ligero con una pregunta fácil de responder.",
    body: "Hola {{1}}, retomo mi mensaje sobre {{2}}. ¿Están cubiertos por ahora o prevén reponer pronto?",
    params: [
      { label: "Cliente", example: "Empresa Demo" },
      { label: "Producto habitual", example: "Shampoo Professional 1L" },
    ],
  },
  seguimiento_valor: {
    name: "seguimiento_valor",
    category: "MARKETING",
    purpose: "Seguimiento 2: aporta valor con precio y disponibilidad reales.",
    body: "Hola {{1}}, revisé {{2}} y hoy tenemos disponibilidad a {{3}} por unidad. Si estás comparando opciones, dime qué cantidad manejas y te paso una propuesta concreta.",
    params: [
      { label: "Cliente", example: "Empresa Demo" },
      { label: "Producto habitual", example: "Shampoo Professional 1L" },
      { label: "Precio unitario vigente", example: "$18.50" },
    ],
  },
  seguimiento_angulo: {
    name: "seguimiento_angulo",
    category: "MARKETING",
    purpose: "Seguimiento 3: cambia de ángulo hacia la objeción probable.",
    body: "Hola {{1}}, si algo de {{2}} no encaja todavía, puedo revisar precio, volumen o entrega contigo. ¿Qué tendría que mejorar para que te sirva?",
    params: [
      { label: "Cliente", example: "Empresa Demo" },
      { label: "Producto habitual", example: "Shampoo Professional 1L" },
    ],
  },
  seguimiento_cierre: {
    name: "seguimiento_cierre",
    category: "MARKETING",
    purpose: "Seguimiento 4: despedida respetuosa que cierra el ciclo.",
    body: "Hola {{1}}, cierro por ahora el tema de {{2}} para no insistir. Si más adelante necesitas reposición o una cotización, responde a este chat y lo retomamos. Gracias.",
    params: [
      { label: "Cliente", example: "Empresa Demo" },
      { label: "Producto habitual", example: "Shampoo Professional 1L" },
    ],
  },
};

export const FOLLOW_UP_TEMPLATES: Record<number, TemplateName> = {
  1: "seguimiento_recordatorio",
  2: "seguimiento_valor",
  3: "seguimiento_angulo",
  4: "seguimiento_cierre",
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

export function isOptOutButtonText(text: string): boolean {
  // Messages sent from an older button-based template can still arrive after deployment.
  return text.trim().toLowerCase() === "no me interesa";
}

/** Only unambiguous written requests stop future outreach automatically. */
export function isExplicitOptOutText(text: string): boolean {
  const normalized = text.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[.!¡¿?]+$/g, "");
  return /^(?:no me interesa|no me (?:escriban|escribas|contacten|contactes)(?: mas)?|dejen? de (?:escribirme|contactarme)|no quiero recibir (?:mas )?mensajes|(?:dame|denme) de baja|baja|stop|unsubscribe)$/.test(normalized);
}
