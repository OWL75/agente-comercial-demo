export type FollowUpStep = {
  step: number;
  title: string;
  productionDelay: string;
  /** Outside WhatsApp's 24 h customer-service window only approved templates can be sent. */
  requiresTemplate: boolean;
  instruction: string;
};

// Three touches on a widening cadence. Every marketing template counts
// against Meta's per-user limit, so a same-day "just checking in" reminder
// (the former +4 h step) was dropped: each touch has to bring something new.
export const FOLLOW_UP_STEPS: readonly FollowUpStep[] = [
  {
    step: 1,
    title: "Aporte de valor",
    productionDelay: "+2 días hábiles sin respuesta",
    requiresTemplate: true,
    instruction:
      "Retoma el hilo con algo nuevo y verificado con las herramientas que responda a su situación, y cierra con una propuesta pequeña y fácil de aceptar, sin presión. Si ya le diste una oferta, no le ofrezcas \"prepararle\" una comparación o cotización: recuérdale en una frase lo que gana con Nova y déjale la puerta abierta. No inventes ningún dato.",
  },
  {
    step: 2,
    title: "Otro ángulo",
    productionDelay: "+7 días (plantilla aprobada)",
    requiresTemplate: true,
    instruction:
      "Cambia de ángulo respecto a tus mensajes anteriores y ofrece una alternativa que sí esté permitida por las herramientas. Sin tono de reclamo.",
  },
  {
    step: 3,
    title: "Cierre del ciclo",
    productionDelay: "+14 días (plantilla aprobada)",
    requiresTemplate: true,
    instruction:
      "Despedida respetuosa: di que no volverás a escribir sobre este tema, deja la puerta abierta y ofrece escribirle más adelante si lo prefiere. Sin culpa ni urgencia artificial.",
  },
];

export const FOLLOW_UP_TOTAL = FOLLOW_UP_STEPS.length;

export function nextFollowUpStep(sentCount: number): FollowUpStep | null {
  return FOLLOW_UP_STEPS[sentCount] ?? null;
}
