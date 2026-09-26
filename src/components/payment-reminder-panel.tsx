"use client";

import { useFormStatus } from "react-dom";
import type { ReminderStep } from "@/lib/payments/payment-messages";
import { StepList } from "@/components/ui/steps";
import { IconCard, IconClock, IconExternal } from "@/components/ui/icons";

function SimulateButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-warning w-full !py-2">
      <IconClock className="h-4 w-4" />
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
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-xl bg-white/[0.03] p-3 ring-1 ring-inset ring-white/[0.06]">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-teal-400/10 text-teal-300 ring-1 ring-inset ring-teal-400/20">
          <IconCard className="h-4 w-4" />
        </span>
        <div>
          <p className="text-base font-semibold text-white tabular-nums">{totalLabel}</p>
          <p className="text-xs text-slate-400">
            Vence el <span className="text-slate-200">{dueDateLabel}</span>
          </p>
        </div>
      </div>

      <StepList
        steps={steps.map((s) => ({
          key: s.step,
          title: s.title,
          detail: `${s.productionTiming}${s.notifyOwner ? " · avisa a Abdiel por Telegram" : ""}`,
          state: s.step <= sentCount ? "sent" : s.step === sentCount + 1 && canSimulate ? "next" : "later",
        }))}
      />

      {canSimulate ? (
        <form action={action}>
          <SimulateButton />
        </form>
      ) : (
        <p className="rounded-xl bg-white/[0.04] px-3 py-2.5 text-xs text-slate-400 ring-1 ring-inset ring-white/[0.06]">{blockedReason}</p>
      )}

      <a href={paymentHref} target="_blank" rel="noreferrer" className="btn btn-secondary w-full !py-2 text-xs">
        Abrir la página de pago que recibe el cliente <IconExternal className="h-3.5 w-3.5" />
      </a>

      <p className="text-[11px] leading-relaxed text-slate-500">
        Demo: no se cobra dinero real. En producción cada recordatorio sale en su fecha como plantilla de utilidad
        aprobada, con el botón «Pagar pedido»; el pago lo confirma el proveedor de pagos.
      </p>
    </div>
  );
}
