"use client";

import { useFormStatus } from "react-dom";
import type { FollowUpStep } from "@/lib/agent/follow-up-sequence";

function SimulateButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:cursor-wait disabled:opacity-70"
    >
      {pending ? "El agente está redactando…" : "Simular que el cliente no responde"}
    </button>
  );
}

export function FollowUpPanel({
  steps,
  sentCount,
  canSimulate,
  blockedReason,
  action,
}: {
  steps: readonly FollowUpStep[];
  sentCount: number;
  canSimulate: boolean;
  blockedReason: string | null;
  action: () => Promise<void>;
}) {
  return (
    <div className="space-y-3">
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
                <p className="text-[11px] text-slate-500">{s.productionDelay}</p>
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

      <p className="text-[11px] leading-relaxed text-slate-500">
        Si el cliente responde o pide no recibir mensajes, la secuencia se detiene. En la demo, cada seguimiento
        llega a WhatsApp como texto, sin botones; en producción, se envía la plantilla de texto aprobada por Meta.
      </p>
    </div>
  );
}
