import { describe, expect, it } from "vitest";
import {
  buildFollowUpContext,
  chooseFollowUpTemplate,
  followUpReplyIssues,
  renderFollowUpBrief,
  type FollowUpMessage,
} from "@/lib/agent/follow-up-context";

// Real conversation, Distribuidora Belleza del Istmo, 2026-09-24 02:48–02:57 UTC.
const at = (hhmm: string) => new Date(`2026-09-24T${hhmm}:00Z`);
const transcript: FollowUpMessage[] = [
  { sender: "agent", createdAt: at("02:48"), body: "Hola Distribuidora Belleza del Istmo, te escribo de Nova Distribution por Shampoo Professional 1L. Como solemos coordinar su reposición, quería saber cómo van de inventario esta semana. ¿Cambió algo en la demanda o necesitan reponer pronto?" },
  { sender: "customer", createdAt: at("02:54"), body: "Por ahora no estamos interesados. Ya estamos comprando con otro proveedor." },
  { sender: "agent", createdAt: at("02:54"), body: "Entiendo, gracias por comentármelo. Para no insistir de más, ¿qué fue lo que más influyó en el cambio: precio, disponibilidad, entregas o atención?" },
  { sender: "customer", createdAt: at("02:56"), body: "Cambiamos porque nos mejoraron el precio y además la última entrega de ustedes llegó tarde." },
  { sender: "agent", createdAt: at("02:56"), body: "Entiendo: el precio y la entrega fueron determinantes, y lamento que hayan tenido esa experiencia. No quiero hacerte una promesa sin verificarla; ¿qué tendría que demostrar Nova para que consideraran compararnos nuevamente en su próxima reposición?" },
];
const insight = {
  motivo_inactividad: "Cambió al proveedor por un precio mejor y porque la última entrega de Nova Distribution llegó tarde.",
  competidor_mencionado: "otro proveedor (sin nombre)",
  objecion: "precio: el proveedor actual ofrece un precio mejor; servicio: la última entrega de Nova Distribution llegó tarde.",
  producto_interes: "Shampoo Professional 1L",
  cantidad: null,
  intencion_compra: "No interesado por ahora; compra actualmente con otro proveedor.",
};
/** What the system actually sent as follow-up 1 (fixed template). */
const SENT_FOLLOW_UP = "Hola Distribuidora Belleza del Istmo, retomo mi mensaje sobre Shampoo Professional 1L. ¿Están cubiertos por ahora o prevén reponer pronto?";

const ctx = buildFollowUpContext(transcript, insight, at("02:57"));

describe("follow-up context from the real conversation", () => {
  it("knows what the customer said, what is pending and what was learned", () => {
    expect(ctx.customerReplied).toBe(true);
    expect(ctx.lastCustomerMessage).toContain("la última entrega de ustedes llegó tarde");
    expect(ctx.pendingQuestion).toBe("¿qué tendría que demostrar Nova para que consideraran compararnos nuevamente en su próxima reposición?");
    expect(ctx.objectionTypes).toEqual(["precio", "servicio"]);
    expect(ctx.known.map((k) => k.label)).toEqual(expect.arrayContaining(["Proveedor actual", "Por qué dejó de comprarnos", "Objeción", "Producto"]));
    expect(ctx.previousFollowUps).toEqual([]);
  });

  it("briefs the agent with the conversation instead of a generic reminder", () => {
    const brief = renderFollowUpBrief(ctx, 1);
    expect(brief).toContain("«Cambiamos porque nos mejoraron el precio y además la última entrega de ustedes llegó tarde.»");
    expect(brief).toContain("Pregunta que quedó pendiente");
    expect(brief).toContain("no lo vuelvas a preguntar");
    expect(brief).toMatch(/Retoma el punto que quedó abierto/);
  });

  it("gives the first touch a focus tied to the delivery concern", () => {
    expect(renderFollowUpBrief(ctx, 1)).toMatch(/cumplimiento[\s\S]*get_delivery_options/);
  });

  it("rejects the follow-up that was actually sent", () => {
    expect(followUpReplyIssues(SENT_FOLLOW_UP, ctx)).toEqual(
      expect.arrayContaining(["ignores_customer_reply", "reopens_answered_need"]),
    );
  });

  it("accepts a follow-up that picks up the thread", () => {
    const good = "Me quedé pensando en lo de la entrega que llegó tarde. Si te sirve, reviso disponibilidad del Shampoo Professional 1L para su próxima reposición y te cuento qué podemos cumplir hoy. ¿Lo reviso?";
    expect(followUpReplyIssues(good, ctx)).toEqual([]);
  });

  it.each([
    ["Entiendo: el precio y la entrega fueron determinantes, y lamento esa experiencia. ¿Qué tendría que demostrar Nova para que consideraran compararnos nuevamente?", "repeats_previous_message"],
    ["Hola, te escribo de Nova Distribution. ¿Podemos conversar sobre su próximo pedido?", "cold_reintroduction"],
    ["¿Con qué proveedor están trabajando ahora?", "asks_known_information"],
    ["Hola, no me has respondido. ¿Pudiste ver mi mensaje?", "guilt_tripping"],
    ["", "empty"],
  ])("flags %s", (draft, issue) => {
    expect(followUpReplyIssues(draft, ctx)).toContain(issue);
  });

  it("does not flag a reminder when the customer never replied", () => {
    const silent = buildFollowUpContext(transcript.slice(0, 1), null, at("03:00"));
    expect(silent.customerReplied).toBe(false);
    expect(followUpReplyIssues("Hola, ¿les sirve que les pase la disponibilidad del Shampoo para esta semana?", silent)).toEqual([]);
  });
});

describe("approved-template choice when the 24 h window is closed", () => {
  const base = { customerReplied: true, objectionTypes: ["precio", "servicio"], quantityKnown: false, alreadySent: ["apertura_recompra"] };

  it("never sends the ¿están cubiertos? reminder to a customer who explained their situation", () => {
    for (const step of [1, 2, 3]) expect(chooseFollowUpTemplate({ ...base, step })).not.toMatch(/recordatorio/);
  });

  it("answers a price comparison with the verified-price template first", () => {
    expect(chooseFollowUpTemplate({ ...base, step: 1 })).toBe("seguimiento_valor");
  });

  it("uses the angle template for a service concern and never repeats a template", () => {
    expect(chooseFollowUpTemplate({ ...base, objectionTypes: ["servicio"], step: 1 })).toBe("seguimiento_angulo");
    expect(chooseFollowUpTemplate({ ...base, step: 2, alreadySent: ["seguimiento_valor"] })).toBe("seguimiento_angulo");
    expect(chooseFollowUpTemplate({ ...base, step: 2, alreadySent: ["seguimiento_valor", "seguimiento_angulo"] })).toBeNull();
    expect(chooseFollowUpTemplate({ ...base, step: 3, alreadySent: ["seguimiento_cierre"] })).toBeNull();
  });

  it("brings value first to a customer who never replied, then an angle, and closes at the last step", () => {
    expect(chooseFollowUpTemplate({ ...base, customerReplied: false, step: 1 })).toBe("seguimiento_valor");
    expect(chooseFollowUpTemplate({ ...base, customerReplied: false, step: 2 })).toBe("seguimiento_angulo");
    expect(chooseFollowUpTemplate({ ...base, step: 3 })).toBe("seguimiento_cierre");
  });
});

describe("agreed follow-up (real conversation 2026-09-25: \"mañana en la tarde con mi socio\")", () => {
  it("keeps the promise, helps the partner decide and leaves an easy way out", async () => {
    const { agreedFollowUpFocus, buildFollowUpContext } = await import("@/lib/agent/follow-up-context");
    const ctx = buildFollowUpContext([], null, new Date(), true);
    const focus = agreedFollowUpFocus({ date: "2026-09-26", action: "Retomar en la tarde; lo decide con su socio" }, ctx);
    expect(focus).toContain("2026-09-26");
    expect(focus).toContain("lo decide con su socio");
    expect(focus).toMatch(/resumen de tres líneas/);
    expect(focus).toMatch(/pedido de prueba/);
    expect(focus).toMatch(/No repitas la lista/);
  });
});
