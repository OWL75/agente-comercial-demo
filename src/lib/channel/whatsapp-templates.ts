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

export type TemplateButton = { text: string; optOut?: boolean };

export type WhatsAppTemplate = {
  name: TemplateName;
  category: "MARKETING";
  purpose: string;
  body: string;
  params: readonly { label: string; example: string }[];
  buttons: readonly TemplateButton[];
};

const NOT_INTERESTED: TemplateButton = { text: "No me interesa", optOut: true };

export const WHATSAPP_TEMPLATES: Record<TemplateName, WhatsAppTemplate> = {
  apertura_recompra: {
    name: "apertura_recompra",
    category: "MARKETING",
    purpose: "Primer contacto cuando el cliente se atrasó en su recompra habitual.",
    body: "Hola {{1}}, te escribe el equipo comercial de Nova Distribution. Vimos que hace {{2}} días no reponen {{3}} y queremos ayudarte a no quedarte sin inventario. ¿Te preparo una propuesta para tu próximo pedido?",
    params: [
      { label: "Cliente", example: "Empresa Demo" },
      { label: "Días desde la última compra", example: "42" },
      { label: "Producto habitual", example: "Shampoo Professional 1L" },
    ],
    buttons: [{ text: "Sí, prepárala" }, { text: "Ahora no" }, NOT_INTERESTED],
  },
  apertura_reactivacion: {
    name: "apertura_reactivacion",
    category: "MARKETING",
    purpose: "Primer contacto con un cliente inactivo o cuyo ticket bajó.",
    body: "Hola {{1}}, te escribe el equipo comercial de Nova Distribution. Hace un tiempo no coincidimos en pedidos de {{2}} y nos gustaría saber cómo podemos ayudarte hoy. ¿Conversamos un momento?",
    params: [
      { label: "Cliente", example: "Empresa Demo" },
      { label: "Producto habitual", example: "Shampoo Professional 1L" },
    ],
    buttons: [{ text: "Sí, conversemos" }, { text: "Ahora no" }, NOT_INTERESTED],
  },
  apertura_producto: {
    name: "apertura_producto",
    category: "MARKETING",
    purpose: "Primer contacto con un cliente que se fue a la competencia: abre con el precio real del producto.",
    body: "Hola {{1}}, te escribe el equipo comercial de Nova Distribution. Hoy tenemos {{2}} disponible a {{3}} por unidad. ¿Te interesa que te arme una cotización para tu próximo pedido?",
    params: [
      { label: "Cliente", example: "Empresa Demo" },
      { label: "Producto habitual", example: "Shampoo Professional 1L" },
      { label: "Precio unitario vigente", example: "$18.50" },
    ],
    buttons: [{ text: "Me interesa" }, { text: "Ahora no" }, NOT_INTERESTED],
  },
  seguimiento_recordatorio: {
    name: "seguimiento_recordatorio",
    category: "MARKETING",
    purpose: "Seguimiento 1: recordatorio ligero con una pregunta fácil de responder.",
    body: "Hola {{1}}, solo quería retomar lo que te comenté sobre {{2}}. ¿Te preparo la cantidad habitual para tu próximo pedido?",
    params: [
      { label: "Cliente", example: "Empresa Demo" },
      { label: "Producto habitual", example: "Shampoo Professional 1L" },
    ],
    buttons: [{ text: "Sí, prepárala" }, { text: "Ahora no" }, NOT_INTERESTED],
  },
  seguimiento_valor: {
    name: "seguimiento_valor",
    category: "MARKETING",
    purpose: "Seguimiento 2: aporta valor con precio y disponibilidad reales.",
    body: "Hola {{1}}, te confirmo que hoy tenemos {{2}} disponible a {{3}} por unidad. Si te sirve, te lo dejo apartado. ¿Lo reservamos?",
    params: [
      { label: "Cliente", example: "Empresa Demo" },
      { label: "Producto habitual", example: "Shampoo Professional 1L" },
      { label: "Precio unitario vigente", example: "$18.50" },
    ],
    buttons: [{ text: "Sí, resérvalo" }, { text: "Tengo dudas" }, { text: "Ahora no" }],
  },
  seguimiento_angulo: {
    name: "seguimiento_angulo",
    category: "MARKETING",
    purpose: "Seguimiento 3: cambia de ángulo hacia la objeción probable.",
    body: "Hola {{1}}, entiendo que quizá no era el mejor momento. Si el tema es precio, volumen o forma de pago de {{2}}, podemos revisar opciones contigo. ¿Lo vemos juntos?",
    params: [
      { label: "Cliente", example: "Empresa Demo" },
      { label: "Producto habitual", example: "Shampoo Professional 1L" },
    ],
    buttons: [{ text: "Revisemos opciones" }, { text: "Ahora no" }, NOT_INTERESTED],
  },
  seguimiento_cierre: {
    name: "seguimiento_cierre",
    category: "MARKETING",
    purpose: "Seguimiento 4: despedida respetuosa que cierra el ciclo.",
    body: "Hola {{1}}, no quiero llenarte el chat, así que este es mi último mensaje sobre {{2}}. Cuando necesites reponer, respóndeme aquí y te atiendo de inmediato. ¡Gracias por tu tiempo!",
    params: [
      { label: "Cliente", example: "Empresa Demo" },
      { label: "Producto habitual", example: "Shampoo Professional 1L" },
    ],
    buttons: [{ text: "Retomemos ahora" }],
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
  const normalized = text.trim().toLowerCase();
  return Object.values(WHATSAPP_TEMPLATES).some((t) =>
    t.buttons.some((b) => b.optOut && b.text.toLowerCase() === normalized),
  );
}
