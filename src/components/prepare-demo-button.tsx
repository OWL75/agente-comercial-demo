"use client";

import { useFormStatus } from "react-dom";

function SubmitButton({ ready }: { ready: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-wait disabled:opacity-70"
    >
      {pending ? "Preparando escenario…" : ready ? "Reiniciar demostración" : "Crear escenario demo"}
    </button>
  );
}

export function PrepareDemoButton({ action, ready }: { action: () => Promise<void>; ready: boolean }) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (
          ready &&
          !window.confirm(
            "Esto eliminará únicamente la conversación, el pedido y la memoria de Empresa Demo. ¿Continuar?",
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <SubmitButton ready={ready} />
    </form>
  );
}
