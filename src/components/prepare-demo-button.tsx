"use client";

import { useFormStatus } from "react-dom";
import { IconPlay } from "@/components/ui/icons";

function SubmitButton({ ready }: { ready: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-primary">
      <IconPlay className="h-4 w-4" />
      {pending ? "Preparando escenario…" : ready ? "Reiniciar demostración" : "Crear escenario demo"}
    </button>
  );
}

export function PrepareDemoButton({ action, ready, customerName }: { action: () => Promise<void>; ready: boolean; customerName: string }) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (
          ready &&
          !window.confirm(
            `Esto eliminará únicamente la conversación, el pedido y la memoria de ${customerName}. ¿Continuar?`,
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
