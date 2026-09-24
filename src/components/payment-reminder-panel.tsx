"use client";

import { useFormStatus } from "react-dom";
import type { ReminderStep } from "@/lib/payments/payment-messages";

function SimulateButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:cursor-wait disabled:opacity-70"
    >
      {pending ? "Enviando recordatorio…" : "Simular que pasa el tiempo sin pago"}
    </button>
  );
}

export function PaymentReminderPanel({
  steps,
  sentCount,
  canSimulate,
  blockedReason,
  dueDateLabel,
  totalLabel,
  paymentHref,
  action,
}: {
  steps: readonly ReminderStep[];
  sentCount: number;
  canSimulate: boolean;
  blockedReason: string | null;
  dueDateLabel: string;
  totalLabel: string;
  paymentHref: string;
  action: () => Promise<void>;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-300">
        {totalLabel} · vence el <span className="font-medium text-slate-100">{dueDateLabel}</span>
      </p>
      <ol className="space-y-2">
        {steps.map((s) => {
          const sent = s.step <= sentCount;
          const next = s.step === sentCount + 1 && canSimulate;
          return (
            <li key={s.step} className="flex gap-2 text-xs">
              <span className={sent ? "text-emerald-400" : next ? "text-amber-400" : "text-slate-600"}>
                {sent ? "✓" : next ? "●" : "○"}
              </span>
              <div>
                <p className={sent || next ? "font-medium text-slate-100" : "text-slate-400"}>
                  {s.step}. {s.title}
                </p>
                <p className="text-[11px] text-slate-500">
                  {s.productionTiming}
                  {s.notifyOwner ? " · avisa al dueño por Telegram" : ""}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      {canSimulate ? (
        <form action={action}>
          <SimulateButton />
        </form>
      ) : (
        <p className="rounded-lg bg-slate-800/60 px-3 py-2 text-xs text-slate-400">{blockedReason}</p>
      )}

      <a
        href={paymentHref}
        target="_blank"
        rel="noreferrer"
        className="block rounded-lg border border-slate-700 px-3 py-2 text-center text-xs text-cyan-300 hover:border-cyan-500"
      >
        Abrir la página de pago que recibe el cliente
      </a>

      <p className="text-[11px] leading-relaxed text-slate-500">
        Demo: no se cobra dinero real. En producción cada recordatorio sale en su fecha como plantilla de utilidad
        aprobada, con el botón «Pagar pedido»; el pago lo confirma el proveedor de pagos.
      </p>
    </div>
  );
}
