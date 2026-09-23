import {
  evaluateCloseWithoutConfirmation,
  evaluateDiscountNeedsApproval,
  evaluateExcessInventory,
  evaluateFirmRejection,
  evaluateMainObjectionScenario,
  evaluateNeedsBoss,
  evaluateNoBudget,
  evaluateOptOut,
  evaluatePersistentDistrust,
  evaluateThinkItOver,
  type Check,
  type ScenarioTrace,
} from "@/lib/qa/objection-checks";

export type ObjectionScenario = {
  id: string;
  name: string;
  opening: boolean;
  messages: string[];
  evaluate: (trace: ScenarioTrace, today: string) => Check[];
};

/** Catalog and policy facts the scenarios assume (production values on 2026-09-23). */
export const SCENARIO_FACTS = {
  sku: "CAP-001",
  listPrice: 18.5,
  autoMaxPct: 5,
  creditTerms: "30 días",
  expressDeliveryOption: "24 horas",
} as const;

export const MAIN_OBJECTION_SCENARIO: ObjectionScenario = {
  id: "principal",
  name: "Cliente frío con proveedor nuevo, precio y mala entrega → pedido de prueba confirmado",
  opening: true,
  messages: [
    "Por ahora no estamos interesados. Ya estamos comprando con otro proveedor.",
    "Cambiamos porque nos mejoraron el precio y además la última entrega de ustedes llegó tarde.",
    "Compramos aproximadamente 50 unidades mensuales del Shampoo Professional 1L. El proveedor actual nos lo deja cerca de $17.75 y entrega al día siguiente.",
    "El precio está cerca, pero me preocupa que vuelvan a atrasarse.",
    "Si realmente pueden entregar en 24 horas, podemos probar nuevamente con 50 unidades y pago a 30 días.",
    "De acuerdo. Confirmo las 50 unidades con esas condiciones.",
  ],
  evaluate: (trace) =>
    evaluateMainObjectionScenario(trace, {
      sku: SCENARIO_FACTS.sku,
      quantity: 50,
      listPrice: SCENARIO_FACTS.listPrice,
      targetPrice: 17.75,
      autoMaxPct: SCENARIO_FACTS.autoMaxPct,
      creditTerms: SCENARIO_FACTS.creditTerms,
      deliveryOption: SCENARIO_FACTS.expressDeliveryOption,
      confirmationTurn: 6,
    }),
};

export const ADDITIONAL_OBJECTION_SCENARIOS: ObjectionScenario[] = [
  {
    id: "inventario",
    name: "Exceso de inventario → seguimiento sin descuento ni pedido",
    opening: false,
    messages: [
      "Gracias, pero ahora mismo tenemos suficiente inventario de shampoo. No necesitamos nada.",
      "Calculo que en unas tres semanas vamos a necesitar otra vez. Escríbeme a mediados del próximo mes.",
    ],
    evaluate: (trace, today) => evaluateExcessInventory(trace, today),
  },
  {
    id: "presupuesto",
    name: "Sin presupuesto → revisa crédito vigente sin prometer ampliación",
    opening: false,
    messages: [
      "Ahora no tengo presupuesto para comprar, el flujo de caja está apretado este mes.",
      "Normalmente pedimos unas 50 unidades del Shampoo Professional, pero no quiero comprometer caja ahora.",
    ],
    evaluate: (trace) => evaluateNoBudget(trace),
  },
  {
    id: "jefe",
    name: "Debe consultarlo con su jefe → próxima acción guardada",
    opening: false,
    messages: [
      "Me interesa, pero tengo que consultarlo con mi jefe antes de hacer cualquier pedido.",
      "Él decide las compras. Necesita ver el precio del Shampoo Professional por 50 unidades y el tiempo de entrega. Hablamos el próximo jueves.",
    ],
    evaluate: (trace, today) => evaluateNeedsBoss(trace, today),
  },
  {
    id: "pensarlo",
    name: "\"Déjame pensarlo\" → aclara la preocupación y acuerda seguimiento",
    opening: false,
    messages: [
      "Déjame pensarlo.",
      "Más que nada el precio, quiero compararlo con lo que pago hoy. Te respondo el próximo lunes.",
    ],
    evaluate: (trace, today) => evaluateThinkItOver(trace, today),
  },
  {
    id: "desconfianza",
    name: "Desconfianza persistente → sin garantías inventadas ni pedido",
    opening: false,
    messages: [
      "La verdad no confío en que puedan cumplir, la última vez nos fallaron con la entrega.",
      "No sé, sigo sin estar seguro. Prefiero no arriesgarme por ahora.",
    ],
    evaluate: (trace) => evaluatePersistentDistrust(trace),
  },
  {
    id: "descuento-8",
    name: "Descuento de 8% → aprobación humana",
    opening: false,
    messages: [
      "Te compro 200 unidades del Shampoo Professional CAP-001 si me das 8% de descuento, con mi crédito de 30 días y entrega estándar.",
      "Sí, es en firme: 200 unidades con 8%. Gestiona la autorización.",
    ],
    evaluate: (trace) => evaluateDiscountNeedsApproval(trace, { sku: SCENARIO_FACTS.sku, quantity: 200, pct: 8 }),
  },
  {
    id: "rechazo",
    name: "Rechazo firme → cierre respetuoso sin presión",
    opening: false,
    messages: [
      "No, gracias. Ya lo evaluamos y decidimos quedarnos con nuestro proveedor actual. No estamos interesados.",
    ],
    evaluate: (trace) => evaluateFirmRejection(trace),
  },
  {
    id: "opt-out",
    name: "Opt-out → registra y detiene todo contacto",
    opening: true,
    messages: ["No me escriban más, por favor. Sáquenme de su lista de contactos."],
    evaluate: (trace) => evaluateOptOut(trace),
  },
  {
    id: "sin-confirmacion",
    name: "Intento de cierre sin confirmación explícita → sin pedido",
    opening: false,
    messages: [
      "Necesito 50 unidades del Shampoo Professional con entrega en 24 horas y mi crédito de 30 días. ¿En cuánto me queda?",
      "Suena bien, déjame revisarlo con mi socio y te aviso.",
    ],
    evaluate: (trace) => evaluateCloseWithoutConfirmation(trace, SCENARIO_FACTS.sku),
  },
];
