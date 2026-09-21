/**
 * WhatsApp sends phone numbers as bare digit strings (e.g. "50766123456"),
 * while our seed data stores human-formatted numbers (e.g. "+507 6612-3456").
 * Comparing them requires stripping everything but digits on both sides.
 */
export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function phonesMatch(a: string, b: string): boolean {
  const normA = normalizePhone(a);
  const normB = normalizePhone(b);
  if (!normA || !normB) return false;
  // WhatsApp numbers omit the leading "+" but always include the country
  // code, so an exact match on digits is enough — no partial/suffix
  // matching, which could false-positive across different customers.
  return normA === normB;
}
