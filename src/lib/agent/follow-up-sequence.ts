export type FollowUpStep = {
  step: number;
  title: string;
  productionDelay: string;
  /** Outside WhatsApp's 24 h customer-service window only approved templates can be sent. */
  requiresTemplate: boolean;
  instruction: string;
};

export const FOLLOW_UP_STEPS: readonly FollowUpStep[] = [
  {
    step: 1,
    title: "Recordatorio ligero",
    productionDelay: "+4 h hábiles sin respuesta",
    requiresTemplate: false,
    instruction:
      "Recordatorio breve y amable (1–2 líneas). Retoma exactamente lo último que hablaron y termina con UNA pregunta muy fácil de responder (sí/no o elegir una opción), por ejemplo si le preparas la cantidad habitual. No repitas tu mensaje anterior ni presiones.",
  },
  {
    step: 2,
    title: "Aporte de valor",
    productionDelay: "+2 días (plantilla aprobada)",
    requiresTemplate: true,
    instruction:
      "Aporta algo nuevo y concreto: consulta con las herramientas el precio vigente y la disponibilidad del producto de interés y menciona el dato real, junto con la condición de entrega si la tienes. Cierra con una propuesta concreta y fácil de aceptar. No inventes ningún dato.",
  },
  {
    step: 3,
    title: "Otro ángulo",
    productionDelay: "+5 días (plantilla aprobada)",
    requiresTemplate: true,
    instruction:
      "Cambia de ángulo: aborda con empatía la objeción más probable según lo conversado (precio, competencia, momento, inventario propio) y ofrece una alternativa que sí esté permitida por las herramientas, o pregunta si hay otra persona que decide las compras con quien convenga hablar. Sin tono de reclamo.",
  },
  {
    step: 4,
    title: "Cierre del ciclo",
    productionDelay: "+10 días (plantilla aprobada)",
    requiresTemplate: true,
    instruction:
      "Mensaje de despedida respetuoso: di claramente que no volverás a escribir sobre este tema para no molestar, deja la puerta abierta para que responda cuando lo necesite y agradece. Sin culpa ni urgencia artificial.",
  },
];

export const FOLLOW_UP_TOTAL = FOLLOW_UP_STEPS.length;

export function nextFollowUpStep(sentCount: number): FollowUpStep | null {
  return FOLLOW_UP_STEPS[sentCount] ?? null;
}
