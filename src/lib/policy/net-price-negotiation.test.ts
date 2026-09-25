import { describe, expect, it } from "vitest";
import { autonomyFloorUnitPrice, nextConcession, quoteByNetPrice } from "@/lib/policy/verified-offer";

const floor = 17.58;
const base = { listUnitPrice: 18.5, floor };

describe("negotiating by price, to the cent", () => {
  it("quotes the customer's exact ask instead of the next whole percent", () => {
    expect(quoteByNetPrice(18.5, 50, 17.7)).toEqual({ listUnitPrice: 18.5, netUnitPrice: 17.7, subtotal: 925, total: 885, discountPct: 4.3243 });
  });

  it("rejects a net price above list or with more than two decimals", () => {
    expect(() => quoteByNetPrice(18.5, 50, 18.6)).toThrow();
    expect(() => quoteByNetPrice(18.5, 50, 17.705)).toThrow();
  });

  it("knows the lowest price the agent may give on its own (5% of $18.50)", () => {
    expect(autonomyFloorUnitPrice(18.5, 5)).toBe(floor);
  });
});

describe("next concession", () => {
  it("accepts an explicit ask within the margin as is: $17.70 is a good price", () => {
    expect(nextConcession({ ...base, lastOffered: 17.76, ask: 17.7 })).toEqual({ unitPrice: 17.7, basis: "ask", withinAutonomy: true });
  });

  it("answers an explicit ask below the margin with the agent's best price", () => {
    expect(nextConcession({ ...base, lastOffered: 17.76, ask: 17.5 })).toEqual({ unitPrice: 17.58, basis: "floor", withinAutonomy: false });
  });

  it("real case: matched the competitor's $17.75, customer asks for better → $17.65, then $17.58, then the owner", () => {
    const first = nextConcession({ ...base, lastOffered: 17.75, ask: null });
    expect(first).toEqual({ unitPrice: 17.65, basis: "step", withinAutonomy: true });
    const second = nextConcession({ ...base, lastOffered: first.unitPrice, ask: null });
    expect(second).toEqual({ unitPrice: 17.58, basis: "floor", withinAutonomy: true });
    expect(nextConcession({ ...base, lastOffered: second.unitPrice, ask: null })).toEqual({ unitPrice: 17.58, basis: "at_floor", withinAutonomy: false });
  });

  it("improves list price in a real step when nothing was offered yet", () => {
    expect(nextConcession({ ...base, lastOffered: null, ask: null })).toEqual({ unitPrice: 18, basis: "step", withinAutonomy: true });
  });
});

describe("first offer once the competitor's price is known", () => {
  it("real case 01:44 UTC: competitor at $17.75 → beat it at $17.65, not the same price", () => {
    expect(nextConcession({ ...base, lastOffered: null, ask: null, reference: 17.75 })).toEqual({ unitPrice: 17.65, basis: "beat_reference", withinAutonomy: true });
  });

  it("a reference just above the floor goes straight to the best price", () => {
    expect(nextConcession({ ...base, lastOffered: null, ask: null, reference: 17.65 })).toEqual({ unitPrice: 17.58, basis: "floor", withinAutonomy: true });
  });

  it("ladder after beating the competitor: $17.65 → $17.58 → the owner", () => {
    const second = nextConcession({ ...base, lastOffered: 17.65, ask: null, reference: 17.75 });
    expect(second).toEqual({ unitPrice: 17.58, basis: "floor", withinAutonomy: true });
    expect(nextConcession({ ...base, lastOffered: 17.58, ask: null, reference: 17.75 })).toEqual({ unitPrice: 17.58, basis: "at_floor", withinAutonomy: false });
  });

  it("a reference below the floor gets the best price, and one above list is ignored", () => {
    expect(nextConcession({ ...base, lastOffered: null, ask: null, reference: 17.2 })).toEqual({ unitPrice: 17.58, basis: "floor", withinAutonomy: true });
    expect(nextConcession({ ...base, lastOffered: null, ask: null, reference: 19 })).toEqual({ unitPrice: 18, basis: "step", withinAutonomy: true });
  });

  it("after a matched offer (older conversations), a request for a better price still steps down", () => {
    expect(nextConcession({ ...base, lastOffered: 17.75, ask: null, reference: 17.75 })).toEqual({ unitPrice: 17.65, basis: "step", withinAutonomy: true });
  });
});
