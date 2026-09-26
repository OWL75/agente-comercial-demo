"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

function ActionButton({ children, className }: { children: React.ReactNode; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`btn ${className}`}>
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
    <div className="flex flex-wrap items-center gap-2.5">
      <form action={onApprove}>
        <ActionButton className="bg-gradient-to-b from-emerald-300 to-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/25 hover:brightness-110">
          Aprobar
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
            className="input !w-28"
          />
          <ActionButton className="btn-secondary">Confirmar</ActionButton>
          <button type="button" onClick={() => setShowModify(false)} className="px-2 text-sm text-slate-500 hover:text-slate-300">
            Cancelar
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setShowModify(true)} className="btn btn-secondary">
          Modificar
        </button>
      )}

      <form action={onReject}>
        <ActionButton className="btn-danger">Rechazar</ActionButton>
      </form>
    </div>
  );
}
