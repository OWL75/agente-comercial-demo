import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyMetaSignature } from "@/lib/channel/verify-signature";

const APP_SECRET = "test-app-secret";

function sign(body: string, secret = APP_SECRET) {
  return `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

describe("verifyMetaSignature", () => {
  it("accepts a correctly signed body", () => {
    const body = JSON.stringify({ hello: "world" });
    expect(verifyMetaSignature(body, sign(body), APP_SECRET)).toBe(true);
  });

  it("rejects a body that was tampered with after signing", () => {
    const body = JSON.stringify({ hello: "world" });
    const signature = sign(body);
    const tamperedBody = JSON.stringify({ hello: "WORLD" });
    expect(verifyMetaSignature(tamperedBody, signature, APP_SECRET)).toBe(false);
  });

  it("rejects a signature made with the wrong secret", () => {
    const body = JSON.stringify({ hello: "world" });
    expect(verifyMetaSignature(body, sign(body, "wrong-secret"), APP_SECRET)).toBe(false);
  });

  it("rejects a missing signature header", () => {
    expect(verifyMetaSignature("{}", null, APP_SECRET)).toBe(false);
  });

  it("rejects a malformed signature header", () => {
    expect(verifyMetaSignature("{}", "not-a-valid-signature", APP_SECRET)).toBe(false);
  });
});
