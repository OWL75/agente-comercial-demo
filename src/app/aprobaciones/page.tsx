import Link from "next/link";
import { listApprovals } from "@/lib/db/approvals";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  discount: "Descuento",
  credit: "Crédito",
  delivery: "Entrega",
  other: "Otro",
};

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-300 ring-1 ring-inset ring-amber-500/30",
  approved: "bg-emerald-500/10 text-emerald-300 ring-1 ring-inset ring-emerald-500/30",
  modified: "bg-blue-500/10 text-blue-300 ring-1 ring-inset ring-blue-500/30",
  rejected: "bg-red-500/10 text-red-300 ring-1 ring-inset ring-red-500/30",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  approved: "Aprobada",
  modified: "Modificada",
  rejected: "Rechazada",
};

export default async function ApprovalsPage() {
  const approvals = await listApprovals();
  const pending = approvals.filter((a) => a.status === "pending");
  const decided = approvals.filter((a) => a.status !== "pending");

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link href="/oportunidades" className="text-sm text-cyan-400 hover:underline">
        ← Centro de Oportunidades
      </Link>
      <header className="mt-4 mb-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-cyan-400">
          SISTECOMP · Nova Distribution
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-50">Excepciones</h1>
        <p className="mt-2 text-sm text-slate-500">
          Decisiones que exceden la autonomía del agente y requieren aprobación humana.
        </p>
      </header>

      <h2 className="mb-3 text-sm font-semibold text-slate-300">Pendientes ({pending.length})</h2>
      {pending.length === 0 ? (
        <p className="mb-8 rounded-xl border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-500">
          No hay excepciones pendientes.
        </p>
      ) : (
        <ul className="mb-8 space-y-2">
          {pending.map((a) => (
            <li key={a.id}>
              <Link
                href={`/aprobaciones/${a.id}`}
                className="flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 transition hover:border-amber-500/60"
              >
                <div>
                  <p className="text-sm font-medium text-slate-100">{a.customerName}</p>
                  <p className="text-xs text-slate-500">{TYPE_LABELS[a.type] ?? a.type} · {formatDate(a.createdAt)}</p>
                </div>
                <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-300 ring-1 ring-inset ring-amber-500/30">
                  Revisar →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {decided.length > 0 && (
        <>
          <h2 className="mb-3 text-sm font-semibold text-slate-300">Decididas</h2>
          <ul className="space-y-2">
            {decided.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/aprobaciones/${a.id}`}
                  className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3 transition hover:border-slate-600"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-200">{a.customerName}</p>
                    <p className="text-xs text-slate-500">{TYPE_LABELS[a.type] ?? a.type} · {formatDate(a.createdAt)}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[a.status]}`}>
                    {STATUS_LABELS[a.status] ?? a.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
