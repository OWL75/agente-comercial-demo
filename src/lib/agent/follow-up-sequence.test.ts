import { describe, expect, it } from "vitest";
import { FOLLOW_UP_STEPS, FOLLOW_UP_TOTAL, nextFollowUpStep } from "@/lib/agent/follow-up-sequence";

describe("follow-up sequence", () => {
  it("has four ordered steps ending with the break-up message", () => {
    expect(FOLLOW_UP_TOTAL).toBe(4);
    expect(FOLLOW_UP_STEPS.map((s) => s.step)).toEqual([1, 2, 3, 4]);
    expect(FOLLOW_UP_STEPS[3].title).toBe("Cierre del ciclo");
  });

  it("only the first touch fits inside the 24 h window; later touches need a template", () => {
    expect(FOLLOW_UP_STEPS.map((s) => s.requiresTemplate)).toEqual([false, true, true, true]);
  });

  it("returns the next step for the number already sent, and null when the sequence is done", () => {
    expect(nextFollowUpStep(0)?.step).toBe(1);
    expect(nextFollowUpStep(3)?.step).toBe(4);
    expect(nextFollowUpStep(4)).toBeNull();
  });
});
