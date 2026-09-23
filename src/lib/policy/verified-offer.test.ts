import { describe, expect, it } from "vitest";
import { quoteMoney, smallestNaturalDiscount } from "./verified-offer";

describe("verified offer money", () => {
  it("uses the displayed net unit consistently for the total", () => {
    expect(quoteMoney(18.5, 50, 4)).toEqual({
      listUnitPrice: 18.5,
      netUnitPrice: 17.76,
      subtotal: 925,
      total: 888,
    });
  });

  it("chooses 4%, not the autonomous maximum 5%, for a $17.75 reference", () => {
    expect(smallestNaturalDiscount(18.5, 17.75, 5)).toBe(4);
  });

  it.each([4.06, -1, 101, Number.NaN])("rejects artificial or invalid percentages: %s", (pct) => {
    expect(() => quoteMoney(18.5, 50, pct)).toThrow("porcentaje entero");
  });
});

