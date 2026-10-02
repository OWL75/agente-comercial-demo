"use server";

import { registerFounder, signupInput } from "@/lib/prospect/signup";

export type SignupState = { status: "idle" | "ok" | "error"; message?: string };

export async function signupAction(_prev: SignupState, formData: FormData): Promise<SignupState> {
  // Honeypot: real people never fill the hidden "website" field.
  if (String(formData.get("website") ?? "").trim()) return { status: "ok" };
  const parsed = signupInput.safeParse({
    company: formData.get("company"),
    contact: formData.get("contact"),
    whatsapp: formData.get("whatsapp"),
    method: formData.get("method"),
    reference: formData.get("reference") ?? "",
  });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Revise los datos." };
  const result = await registerFounder(parsed.data);
  return result.ok ? { status: "ok" } : { status: "error", message: result.error };
}
