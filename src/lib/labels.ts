import type { OpportunityPriority, OpportunityStatus } from "@/lib/db/opportunities";

export const SIGNAL_LABELS: Record<string, string> = {
  inactividad: "Inactividad fuera de patrón",
  reduccion_frecuencia: "Reducción de frecuencia",
  caida_ticket: "Caída de ticket promedio",
  cambio_competidor: "Posible cambio a competidor",
  recompra_atrasada: "Recompra atrasada",
};

export const STATUS_LABELS: Record<OpportunityStatus, string> = {
  detectada: "Detectada",
  preparada: "Preparada",
  contactada: "Contactada",
  conversando: "Conversando",
  negociando: "Negociando",
  esperando_aprobacion: "Esperando aprobación",
  cerrada: "Cerrada",
  perdida: "Perdida",
};

export const PRIORITY_LABELS: Record<OpportunityPriority, string> = {
  alta: "Alta",
  media: "Media",
  baja: "Baja",
};

export const PRIORITY_STYLES: Record<OpportunityPriority, string> = {
  alta: "bg-red-500/10 text-red-400 ring-1 ring-inset ring-red-500/30",
  media: "bg-amber-500/10 text-amber-400 ring-1 ring-inset ring-amber-500/30",
  baja: "bg-slate-500/10 text-slate-400 ring-1 ring-inset ring-slate-500/30",
};

export const CONVERSATION_STAGE_LABELS: Record<string, string> = {
  discovery: "Descubrimiento",
  objection_handling: "Manejo de objeciones",
  negotiating: "Negociando",
  awaiting_approval: "Esperando aprobación",
  closing: "Cerrando",
  closed: "Cerrada",
};

export const AUDIT_CATEGORY_LABELS: Record<string, string> = {
  tool_call: "Herramienta",
  policy_check: "Política",
  approval_decided: "Aprobación",
  order_created: "Pedido",
  opt_out: "Opt-out",
  system: "Sistema",
};

export const STATUS_STYLES: Record<OpportunityStatus, string> = {
  detectada: "bg-cyan-500/10 text-cyan-300 ring-1 ring-inset ring-cyan-500/30",
  preparada: "bg-blue-500/10 text-blue-300 ring-1 ring-inset ring-blue-500/30",
  contactada: "bg-indigo-500/10 text-indigo-300 ring-1 ring-inset ring-indigo-500/30",
  conversando: "bg-violet-500/10 text-violet-300 ring-1 ring-inset ring-violet-500/30",
  negociando: "bg-fuchsia-500/10 text-fuchsia-300 ring-1 ring-inset ring-fuchsia-500/30",
  esperando_aprobacion: "bg-amber-500/10 text-amber-300 ring-1 ring-inset ring-amber-500/30",
  cerrada: "bg-emerald-500/10 text-emerald-300 ring-1 ring-inset ring-emerald-500/30",
  perdida: "bg-slate-700/30 text-slate-500 ring-1 ring-inset ring-slate-600/30",
};

/** The commercial path of a conversation, in order (for the stage stepper). */
export const CONVERSATION_STAGE_ORDER = [
  "discovery",
  "objection_handling",
  "negotiating",
  "awaiting_approval",
  "closing",
  "closed",
] as const;

export const CONVERSATION_STAGE_STYLES: Record<string, string> = {
  discovery: "bg-sky-500/10 text-sky-300 ring-1 ring-inset ring-sky-500/25",
  objection_handling: "bg-violet-500/10 text-violet-300 ring-1 ring-inset ring-violet-500/25",
  negotiating: "bg-fuchsia-500/10 text-fuchsia-300 ring-1 ring-inset ring-fuchsia-500/25",
  awaiting_approval: "bg-amber-500/10 text-amber-300 ring-1 ring-inset ring-amber-500/25",
  closing: "bg-teal-500/10 text-teal-300 ring-1 ring-inset ring-teal-500/25",
  closed: "bg-emerald-500/10 text-emerald-300 ring-1 ring-inset ring-emerald-500/25",
};
