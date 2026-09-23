import { INSIGHT_OUTCOMES } from "@/lib/agent/sales-playbook";

const FIELDS = {
  motivoInactividad: "motivo_inactividad", competidorMencionado: "competidor_mencionado",
  objecion: "objecion", productoInteres: "producto_interes", cantidad: "cantidad",
  precioObjetivo: "precio_objetivo", condicionSolicitada: "condicion_solicitada",
  intencionCompra: "intencion_compra", resultado: "resultado", proximaAccion: "proxima_accion",
  proximaFecha: "proxima_fecha", resumen: "resumen",
} as const;

/** A real calendar date in YYYY-MM-DD, the only format the `date` column accepts reliably. */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// A value the column would reject must not take the whole insight down with it:
// it is dropped and reported back to the model, and every other field is kept.
const VALIDATORS: Partial<Record<keyof typeof FIELDS, (value: string | number) => string | null>> = {
  proximaFecha: (v) => (typeof v === "string" && isIsoDate(v) ? null : "usa el formato AAAA-MM-DD con una fecha real"),
  resultado: (v) =>
    typeof v === "string" && (INSIGHT_OUTCOMES as readonly string[]).includes(v)
      ? null
      : `usa uno de: ${INSIGHT_OUTCOMES.join(", ")}`,
  cantidad: (v) => (typeof v === "number" && Number.isSafeInteger(v) && v > 0 ? null : "debe ser un entero positivo"),
  precioObjetivo: (v) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? null : "debe ser un número no negativo"),
};

export type InsightPatch = {
  values: Record<string, string | number | boolean>;
  rejected: Array<{ field: string; reason: string }>;
};

/** Omitted/null fields preserve memory. The agent cannot clear a suppression. */
export function buildInsightPatchWithRejections(input: Record<string, unknown>): InsightPatch {
  const values: Record<string, string | number | boolean> = {};
  const rejected: InsightPatch["rejected"] = [];
  for (const [source, column] of Object.entries(FIELDS)) {
    const value = input[source];
    if (typeof value !== "string" && typeof value !== "number") continue;
    const reason = VALIDATORS[source as keyof typeof FIELDS]?.(value) ?? null;
    if (reason) rejected.push({ field: source, reason });
    else values[column] = value;
  }
  if (input.optOut === true) values.opt_out = true;
  return { values, rejected };
}

export function buildInsightPatch(input: Record<string, unknown>): Record<string, string | number | boolean> {
  return buildInsightPatchWithRejections(input).values;
}
