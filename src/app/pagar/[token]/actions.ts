"use server";

import { revalidatePath } from "next/cache";
import { markPaymentReceived, reportPaymentIssue } from "@/lib/payments/payments";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/payments/payment-messages";

// Public by design: the unguessable token in the URL is the only credential,
// like any payment link. Actions only ever act on the order behind that token.
export async function payAction(token: string, method: string): Promise<void> {
  // Only the sandbox checkout may mark an order as paid from the page. With a
  // real provider, "paid" must come from its signed webhook, never a click.
  if ((process.env.PAYMENT_PROVIDER ?? "sandbox") !== "sandbox") throw new Error("Pago simulado deshabilitado.");
  if (!(method in PAYMENT_METHODS)) throw new Error("Método de pago no válido.");
  await markPaymentReceived(token, method as PaymentMethod);
  revalidatePath(`/pagar/${token}`);
}

export async function reportIssueAction(token: string, formData: FormData): Promise<void> {
  await reportPaymentIssue(token, String(formData.get("issue") ?? ""));
  revalidatePath(`/pagar/${token}`);
}
