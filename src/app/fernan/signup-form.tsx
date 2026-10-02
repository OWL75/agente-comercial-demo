"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { signupAction, type SignupState } from "./actions";
import { IconCheckCircle } from "@/components/ui/icons";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-primary w-full">
      {pending ? "Enviando…" : label}
    </button>
  );
}

export function SignupForm({ founder }: { founder: boolean }) {
  const [state, action] = useActionState<SignupState, FormData>(signupAction, { status: "idle" });

  if (state.status === "ok") {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <IconCheckCircle className="h-10 w-10 text-emerald-300" />
        <p className="text-base font-semibold text-white">¡Listo! Recibimos su registro.</p>
        <p className="max-w-sm text-sm leading-relaxed text-slate-400">
          Verificamos su pago y le escribimos por WhatsApp para coordinar la implementación y la carga de sus clientes.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs text-slate-400">Empresa</span>
          <input name="company" required maxLength={120} className="input" placeholder="Distribuidora…" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-slate-400">Su nombre</span>
          <input name="contact" required maxLength={120} className="input" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-slate-400">WhatsApp</span>
          <input name="whatsapp" required inputMode="tel" className="input" placeholder="+507 6000-0000" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-slate-400">Cómo pagó</span>
          <select name="method" required className="input cursor-pointer" defaultValue="paypal">
            <option value="paypal">PayPal</option>
            <option value="yappy">Yappy</option>
          </select>
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs text-slate-400">Número de transacción o comprobante (opcional)</span>
        <input name="reference" maxLength={120} className="input" />
      </label>
      {state.status === "error" && <p className="text-sm text-rose-400">{state.message}</p>}
      <Submit label={founder ? "Reservar mi cupo de fundador" : "Unirme a la lista de espera"} />
    </form>
  );
}
