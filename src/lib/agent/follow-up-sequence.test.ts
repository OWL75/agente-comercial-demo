import { describe, expect, it } from "vitest";
import { FOLLOW_UP_STEPS, FOLLOW_UP_TOTAL, nextFollowUpStep } from "@/lib/agent/follow-up-sequence";

describe("follow-up sequence", () => {
  it("has three ordered steps ending with the break-up message", () => {
    expect(FOLLOW_UP_TOTAL).toBe(3);
    expect(FOLLOW_UP_STEPS.map((s) => s.step)).toEqual([1, 2, 3]);
    expect(FOLLOW_UP_STEPS.map((s) => s.title)).toEqual(["Aporte de valor", "Otro ángulo", "Cierre del ciclo"]);
  });

  it("spaces touches out instead of a same-day reminder", () => {
    expect(FOLLOW_UP_STEPS.map((s) => s.productionDelay)).toEqual([
      "+2 días hábiles sin respuesta",
      "+7 días (plantilla aprobada)",
      "+14 días (plantilla aprobada)",
    ]);
    expect(FOLLOW_UP_STEPS.every((s) => s.requiresTemplate)).toBe(true);
  });

  it("returns the next step for the number already sent, and null when the sequence is done", () => {
    expect(nextFollowUpStep(0)?.step).toBe(1);
    expect(nextFollowUpStep(2)?.step).toBe(3);
    expect(nextFollowUpStep(3)).toBeNull();
  });
});
