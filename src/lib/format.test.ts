import { describe, expect, it } from "vitest";
import { formatCurrency, formatDate, formatDays, formatUnitPrice } from "@/lib/format";

describe("formatCurrency", () => {
  it("formats a positive amount as USD with no decimals", () => {
    expect(formatCurrency(7240)).toBe("$7,240");
  });

  it("returns an em dash for null/undefined", () => {
    expect(formatCurrency(null)).toBe("—");
    expect(formatCurrency(undefined)).toBe("—");
  });
});

describe("formatUnitPrice", () => {
  it("keeps cents visible on per-unit prices", () => {
    expect(formatUnitPrice(18.5)).toBe("$18.50");
  });

  it("returns an em dash for missing values", () => {
    expect(formatUnitPrice(null)).toBe("—");
  });
});

describe("formatDate", () => {
  it("returns an em dash for missing values", () => {
    expect(formatDate(null)).toBe("—");
  });

  it("returns an em dash for an invalid date string", () => {
    expect(formatDate("not-a-date")).toBe("—");
  });

  it("formats a valid ISO date", () => {
    expect(formatDate("2026-07-10")).toMatch(/2026/);
  });
});

describe("formatDays", () => {
  it("pluralizes correctly", () => {
    expect(formatDays(1)).toBe("1 día");
    expect(formatDays(2)).toBe("2 días");
    expect(formatDays(0)).toBe("0 días");
  });

  it("returns an em dash for null", () => {
    expect(formatDays(null)).toBe("—");
  });
});
