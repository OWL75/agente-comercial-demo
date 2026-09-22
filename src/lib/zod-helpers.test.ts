import { describe, expect, it } from "vitest";
import { z } from "zod";
import { uuidLike } from "@/lib/zod-helpers";

describe("uuidLike", () => {
  it("accepts a proper v4 UUID (what z.string().uuid() also accepts)", () => {
    expect(uuidLike.safeParse("35c649de-3f58-4d3d-b930-469adec4ca88").success).toBe(true);
  });

  // Regression: z.string().uuid() rejects this — RFC 4122 requires the
  // version nibble to be 1-8, and this one is 0. Postgres's uuid column
  // type doesn't care, and the seed dataset (Comercial Delta et al.) uses
  // exactly this shape. Found live when save_customer_insight rejected
  // Comercial Delta's real customerId with "Invalid UUID".
  it("accepts the seed dataset's hand-crafted IDs that plain z.string().uuid() rejects", () => {
    const seedId = "c0000000-0000-0000-0000-000000000001";
    expect(z.string().uuid().safeParse(seedId).success).toBe(false);
    expect(uuidLike.safeParse(seedId).success).toBe(true);
  });

  it("rejects strings that aren't UUID-shaped at all", () => {
    expect(uuidLike.safeParse("not-a-uuid").success).toBe(false);
    expect(uuidLike.safeParse("").success).toBe(false);
  });
});
