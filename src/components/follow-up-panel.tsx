"use client";

import { useFormStatus } from "react-dom";
import type { FollowUpStep } from "@/lib/agent/follow-up-sequence";
import type { FollowUpAgreement } from "@/lib/agent/follow-up-data";
import { StepList } from "@/components/ui/steps";
import { IconClock } from "@/components/ui/icons";

function SimulateButton({ label = "Simular que el cliente no responde" }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-warning w-full !py-2">
      <IconClock className="h-4 w-4" />
      {pending ? "Fernán está redactando…" : label}
    </button>
  );
}

export function FollowUpPanel({
  steps,
  sentCount,
  canSimulate,
  blockedReason,
  action,
  agreed,
  agreedAction,
}: {
  steps: readonly FollowUpStep[];
  sentCount: number;
  canSimulate: boolean;
  blockedReason: string | null;
  action: () => Promise<void>;
  agreed: FollowUpAgreement | null;
  agreedAction: () => Promise<void>;
}) {
  return (
    <div className="space-y-4">
      {agreed && (
        <div className="space-y-2.5 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.06] p-3.5">
          <p className="text-xs font-semibold text-emerald-300">Retomar lo acordado · {agreed.date}</p>
          {agreed.action && <p className="text-xs leading-relaxed text-slate-300">{agreed.action}</p>}
          <form action={agreedAction}>
            <SimulateButton label="Simular que llegó el momento acordado" />
          </form>
        </div>
      )}
      <StepList
        steps={steps.map((s) => ({
          key: s.step,
          title: s.title,
          detail: s.productionDelay,
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

      <p className="text-[11px] leading-relaxed text-slate-500">
        Si el cliente responde o pide no recibir mensajes, la secuencia se detiene. En la demo, cada seguimiento
        llega a WhatsApp como texto, sin botones; en producción, se envía la plantilla de texto aprobada por Meta.
      </p>
    </div>
  );
}
