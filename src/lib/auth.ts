const COOKIE_NAME = "demo_session";

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function expectedSessionValue(): Promise<string | null> {
  const password = process.env.DEMO_ACCESS_PASSWORD;
  if (!password) return null;
  return sha256Hex(password);
}

export async function sessionValueForPassword(password: string): Promise<string> {
  return sha256Hex(password);
}

export { COOKIE_NAME };
