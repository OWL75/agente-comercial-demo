import { it, expect } from "vitest";
import { buildInsightPatch, buildInsightPatchWithRejections, isIsoDate } from "./insight-patch";

it("preserves omitted fields", () => expect(buildInsightPatch({ cantidad: 200 })).toEqual({ cantidad: 200 }));
it("does not clear memory with null", () => expect(buildInsightPatch({ competidorMencionado: null })).toEqual({}));
it("does not allow the agent to clear opt-out", () => expect(buildInsightPatch({ optOut: false })).toEqual({}));
it("persists explicit opt-out", () => expect(buildInsightPatch({ optOut: true })).toEqual({ opt_out: true }));
it("ignores unknown fields", () => expect(buildInsightPatch({ customerId: "other", admin: true })).toEqual({}));
it("preserves zero values", () => expect(buildInsightPatch({ precioObjetivo: 0 })).toEqual({ precio_objetivo: 0 }));

it("accepts only real YYYY-MM-DD dates", () => {
  expect(isIsoDate("2026-10-15")).toBe(true);
  expect(isIsoDate("2026-02-30")).toBe(false);
  expect(isIsoDate("próximo mes")).toBe(false);
  expect(isIsoDate("15/10/2026")).toBe(false);
});

it("drops an invalid follow-up date but keeps every other field", () => {
  const patch = buildInsightPatchWithRejections({
    competidorMencionado: "Proveedor X", proximaAccion: "Llamar", proximaFecha: "el próximo mes",
  });
  expect(patch.values).toEqual({ competidor_mencionado: "Proveedor X", proxima_accion: "Llamar" });
  expect(patch.rejected.map((r) => r.field)).toEqual(["proximaFecha"]);
});

it("only stores known outcome codes", () => {
  expect(buildInsightPatch({ resultado: "seguimiento_acordado" })).toEqual({ resultado: "seguimiento_acordado" });
  expect(buildInsightPatchWithRejections({ resultado: "cliente perdido" }).rejected[0].field).toBe("resultado");
});

it("rejects quantities and prices the database constraints would refuse", () => {
  const patch = buildInsightPatchWithRejections({ cantidad: 0, precioObjetivo: -1, objecion: "precio: caro" });
  expect(patch.values).toEqual({ objecion: "precio: caro" });
  expect(patch.rejected.map((r) => r.field)).toEqual(["cantidad", "precioObjetivo"]);
});
