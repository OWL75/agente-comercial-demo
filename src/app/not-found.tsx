import Link from "next/link";

export default function NotFound() {
  return (
    <main className="app-backdrop flex min-h-screen items-center justify-center px-4">
      <div className="surface max-w-sm p-8 text-center">
        <p className="text-gradient text-4xl font-semibold tracking-tight">404</p>
        <p className="mt-3 text-sm font-medium text-slate-200">No encontramos esta página</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">Puede que la conversación o la oportunidad se haya reiniciado en la demo.</p>
        <Link href="/oportunidades" className="btn btn-primary mt-6">
          Volver al panel
        </Link>
      </div>
    </main>
  );
}
