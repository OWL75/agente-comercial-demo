"use client";

import { useState, useTransition, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { safeLoginDestination } from "@/lib/security/redirect";
import { IconSpark } from "@/components/ui/icons";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.message ?? "No se pudo iniciar sesión.");
        return;
      }
      router.replace(safeLoginDestination(searchParams.get("next")));
      router.refresh();
    });
  }

  return (
    <div className="app-backdrop relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="pointer-events-none absolute left-1/2 top-1/3 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-teal-400/10 blur-3xl" />
      <form onSubmit={handleSubmit} className="surface relative w-full max-w-sm p-8 animate-fade-up">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-teal-300 via-cyan-400 to-indigo-500 text-slate-950 shadow-xl shadow-teal-500/25">
            <IconSpark className="h-6 w-6" />
          </span>
          <p className="mt-4 text-lg font-semibold tracking-tight text-white">Agente Comercial Autónomo</p>
          <p className="mt-1 text-sm text-slate-400">SISTECOMP · Nova Distribution</p>
        </div>
        <label className="mb-2 block text-xs font-medium text-slate-400">Contraseña de acceso</label>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input mb-4"
        />
        {error && <p className="mb-4 text-sm text-rose-400">{error}</p>}
        <button type="submit" disabled={pending} className="btn btn-primary w-full">
          {pending ? "Verificando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
