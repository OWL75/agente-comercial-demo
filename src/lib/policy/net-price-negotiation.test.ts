import { describe, expect, it } from "vitest";
import { autonomyFloorUnitPrice, quoteByNetPrice, recommendedResponseUnitPrice } from "@/lib/policy/verified-offer";

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

  it("accepts an ask within the margin as is: $17.70 is a good price, no counter, no jump to 5%", () => {
    expect(recommendedResponseUnitPrice(17.7, 17.58)).toEqual({ withinAutonomy: true, unitPrice: 17.7 });
    expect(recommendedResponseUnitPrice(17.58, 17.58)).toEqual({ withinAutonomy: true, unitPrice: 17.58 });
  });

  it("answers an ask below the margin with the agent's best price, not the ask", () => {
    expect(recommendedResponseUnitPrice(17.5, 17.58)).toEqual({ withinAutonomy: false, unitPrice: 17.58 });
  });
});
