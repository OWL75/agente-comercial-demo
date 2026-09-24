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
      "Retoma el hilo: vuelve sobre lo que quedó abierto, de forma más fácil de responder. Sin oferta nueva ni presión.",
  },
  {
    step: 2,
    title: "Aporte de valor",
    productionDelay: "+2 días (plantilla aprobada)",
    requiresTemplate: true,
    instruction:
      "Aporta algo nuevo, verificado con las herramientas, que responda a la preocupación concreta del cliente, y cierra con una propuesta pequeña y fácil de aceptar. No inventes ningún dato.",
  },
  {
    step: 3,
    title: "Otro ángulo",
    productionDelay: "+5 días (plantilla aprobada)",
    requiresTemplate: true,
    instruction:
      "Cambia de ángulo respecto a tus mensajes anteriores y ofrece una alternativa que sí esté permitida por las herramientas. Sin tono de reclamo.",
  },
  {
    step: 4,
    title: "Cierre del ciclo",
    productionDelay: "+10 días (plantilla aprobada)",
    requiresTemplate: true,
    instruction:
      "Despedida respetuosa: di que no volverás a escribir sobre este tema, deja la puerta abierta y agradece. Sin culpa ni urgencia artificial.",
  },
];

export const FOLLOW_UP_TOTAL = FOLLOW_UP_STEPS.length;

export function nextFollowUpStep(sentCount: number): FollowUpStep | null {
  return FOLLOW_UP_STEPS[sentCount] ?? null;
}
