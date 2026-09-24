import { describe, expect, it } from "vitest";
import { autonomyFloorUnitPrice, quoteByNetPrice, suggestedCounterUnitPrice } from "@/lib/policy/verified-offer";

describe("negotiating by price, to the cent", () => {
  it("quotes the customer's exact ask instead of the next whole percent", () => {
    expect(quoteByNetPrice(18.5, 50, 17.7)).toEqual({ listUnitPrice: 18.5, netUnitPrice: 17.7, subtotal: 925, total: 885, discountPct: 4.3243 });
  });

  it("rejects a net price above list or with more than two decimals", () => {
    expect(() => quoteByNetPrice(18.5, 50, 18.6)).toThrow();
    expect(() => quoteByNetPrice(18.5, 50, 17.705)).toThrow();
  });

  it("knows the lowest price the agent may give on its own (5% of $18.50)", () => {
    expect(autonomyFloorUnitPrice(18.5, 5)).toBe(17.58);
  });

  it("counters halfway between the last offer and the ask, never below the ask or the floor", () => {
    // Real case: offered $17.76, customer asked $17.70 → counter $17.73, not $17.58.
    expect(suggestedCounterUnitPrice(17.76, 17.7, 17.58)).toBe(17.73);
    expect(suggestedCounterUnitPrice(17.73, 17.7, 17.58)).toBe(17.72);
    expect(suggestedCounterUnitPrice(17.76, 17.2, 17.58)).toBe(17.67);
    expect(suggestedCounterUnitPrice(17.7, 17.7, 17.58)).toBe(17.7);
  });
});
