import { it, expect } from "vitest";
import { buildInsightPatch } from "./insight-patch";

it("preserves omitted fields", () => expect(buildInsightPatch({ cantidad: 200 })).toEqual({ cantidad: 200 }));
it("does not clear memory with null", () => expect(buildInsightPatch({ competidorMencionado: null })).toEqual({}));
it("does not allow the agent to clear opt-out", () => expect(buildInsightPatch({ optOut: false })).toEqual({}));
it("persists explicit opt-out", () => expect(buildInsightPatch({ optOut: true })).toEqual({ opt_out: true }));
it("ignores unknown fields", () => expect(buildInsightPatch({ customerId: "other", admin: true })).toEqual({}));
it("preserves zero values", () => expect(buildInsightPatch({ precioObjetivo: 0 })).toEqual({ precio_objetivo: 0 }));
