const FIELDS = {
  motivoInactividad: "motivo_inactividad", competidorMencionado: "competidor_mencionado",
  objecion: "objecion", productoInteres: "producto_interes", cantidad: "cantidad",
  precioObjetivo: "precio_objetivo", condicionSolicitada: "condicion_solicitada",
  intencionCompra: "intencion_compra", resultado: "resultado", proximaAccion: "proxima_accion",
  proximaFecha: "proxima_fecha", resumen: "resumen",
} as const;

/** Omitted/null fields preserve memory. The agent cannot clear a suppression. */
export function buildInsightPatch(input: Record<string, unknown>): Record<string, string | number | boolean> {
  const patch: Record<string, string | number | boolean> = {};
  for (const [source, column] of Object.entries(FIELDS)) {
    const value = input[source];
    if (typeof value === "string" || typeof value === "number") patch[column] = value;
  }
  if (input.optOut === true) patch.opt_out = true;
  return patch;
}
