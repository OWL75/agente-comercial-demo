"use client";

import { useFormStatus } from "react-dom";
import { IconChat } from "@/components/ui/icons";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-primary">
      <IconChat className="h-4 w-4" />
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
