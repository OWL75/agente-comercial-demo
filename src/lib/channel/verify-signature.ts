import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies Meta's `X-Hub-Signature-256` header (HMAC-SHA256 of the raw
 * request body, keyed with the app secret) so the webhook can't be spoofed
 * by anyone who guesses the URL. Meta requires this to be checked against
 * the *raw* body bytes/string — not a re-serialized JSON.parse(...) of it,
 * since that can produce a different byte sequence and always fail.
 *
 * No `server-only` guard here (unlike the rest of `src/lib`): this is a
 * pure function that takes its secret as a parameter rather than reading
 * `process.env` or touching the DB, so nothing leaks if it were ever
 * bundled client-side — and keeping it guard-free lets it run under plain
 * `vitest`/`tsx` without the `--conditions=react-server` workaround the
 * rest of the server-only code needs (see scripts/qa-scenarios.ts).
 */
export function verifyMetaSignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader) return false;
  const [scheme, providedHex] = signatureHeader.split("=");
  if (scheme !== "sha256" || !providedHex) return false;

  const expectedHex = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");

  const provided = Buffer.from(providedHex, "hex");
  const expected = Buffer.from(expectedHex, "hex");
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}
