"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

function ActionButton({
  children,
  className,
}: {
  children: React.ReactNode;
  className: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${className} disabled:cursor-wait disabled:opacity-60`}>
      {pending ? "Procesando…" : children}
    </button>
  );
}

export function ApprovalActions({
  suggestedValue,
  onApprove,
  onModify,
  onReject,
}: {
  suggestedValue: number | null;
  onApprove: () => Promise<void>;
  onModify: (formData: FormData) => Promise<void>;
  onReject: () => Promise<void>;
}) {
  const [showModify, setShowModify] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <form action={onApprove}>
        <ActionButton className="rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400">
          APROBAR
        </ActionButton>
      </form>

      {showModify ? (
        <form action={onModify} className="flex items-center gap-2">
          <input
            type="number"
            name="modifiedValue"
            step="any"
            defaultValue={suggestedValue ?? undefined}
            autoFocus
            className="w-28 rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
          />
          <ActionButton className="rounded-lg bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-400">
            Confirmar
          </ActionButton>
          <button
            type="button"
            onClick={() => setShowModify(false)}
            className="text-sm text-slate-500 hover:text-slate-300"
          >
            Cancelar
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowModify(true)}
          className="rounded-lg border border-slate-700 px-5 py-2.5 text-sm font-medium text-slate-300 hover:border-slate-500 hover:text-slate-100"
        >
          MODIFICAR
        </button>
      )}

      <form action={onReject}>
        <ActionButton className="rounded-lg border border-red-500/40 px-5 py-2.5 text-sm font-semibold text-red-400 hover:bg-red-500/10">
          RECHAZAR
        </ActionButton>
      </form>
    </div>
  );
}
