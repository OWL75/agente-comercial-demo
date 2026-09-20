"use client";

import { useFormStatus } from "react-dom";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-wait disabled:opacity-70"
    >
      {pending ? "Iniciando conversación…" : "Iniciar conversación"}
    </button>
  );
}

export function StartConversationButton({ action }: { action: () => Promise<void> }) {
  return (
    <form action={action}>
      <SubmitButton />
    </form>
  );
}
