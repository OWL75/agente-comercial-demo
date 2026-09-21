import { describe, expect, it } from "vitest";
import { normalizePhone, phonesMatch } from "@/lib/channel/phone";

describe("normalizePhone", () => {
  it("strips formatting characters, keeping only digits", () => {
    expect(normalizePhone("+507 6612-3456")).toBe("50766123456");
    expect(normalizePhone("50766123456")).toBe("50766123456");
    expect(normalizePhone("(507) 6612-3456")).toBe("50766123456");
  });
});

describe("phonesMatch", () => {
  it("matches the same number in different formats", () => {
    expect(phonesMatch("+507 6612-3456", "50766123456")).toBe(true);
  });

  it("does not match different numbers", () => {
    expect(phonesMatch("+507 6612-3456", "50766123457")).toBe(false);
  });

  it("rejects empty input on either side", () => {
    expect(phonesMatch("", "50766123456")).toBe(false);
    expect(phonesMatch("+507 6612-3456", "")).toBe(false);
  });
});
