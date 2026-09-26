import Link from "next/link";
import { listApprovals } from "@/lib/db/approvals";
import { formatDate } from "@/lib/format";
import { Avatar, Card, EmptyState, PageHeader, Pill } from "@/components/ui/primitives";
import { IconArrowRight, IconCheckCircle, IconShield } from "@/components/ui/icons";

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
  modified: "bg-sky-500/10 text-sky-300 ring-1 ring-inset ring-sky-500/30",
  rejected: "bg-rose-500/10 text-rose-300 ring-1 ring-inset ring-rose-500/30",
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
    <main className="mx-auto max-w-4xl px-5 py-8 sm:px-8 lg:py-10">
      <PageHeader
        eyebrow="Control humano"
        title="Excepciones"
        description="Lo que excede la autonomía del agente. Abdiel decide desde Telegram o desde aquí, y Fernán le responde al cliente en cuanto hay decisión."
      />

      <Card
        title="Pendientes"
        icon={<IconShield className="h-4 w-4" />}
        action={<span className="text-xs text-slate-500 tabular-nums">{pending.length}</span>}
        bodyClassName=""
        className="mb-6 overflow-hidden"
      >
        {pending.length === 0 ? (
          <EmptyState icon={<IconCheckCircle className="h-5 w-5" />} title="Todo al día">
            No hay decisiones esperando. Cuando un cliente pida algo fuera de las reglas, aparecerá aquí al instante.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {pending.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/aprobaciones/${a.id}`}
                  className="group flex items-center gap-4 bg-amber-400/[0.03] px-5 py-4 transition hover:bg-amber-400/[0.07]"
                >
                  <Avatar name={a.customerName} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-100">{a.customerName}</p>
                    <p className="text-xs text-slate-500">
                      {TYPE_LABELS[a.type] ?? a.type} · {formatDate(a.createdAt)}
                    </p>
                  </div>
                  <span className="btn btn-warning !px-3 !py-1.5 text-xs">
                    Revisar <IconArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {decided.length > 0 && (
        <Card
          title="Decididas"
          action={<span className="text-xs text-slate-500 tabular-nums">{decided.length}</span>}
          bodyClassName=""
          className="overflow-hidden"
        >
          <ul className="divide-y divide-white/[0.05]">
            {decided.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/aprobaciones/${a.id}`}
                  className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-white/[0.025]"
                >
                  <Avatar name={a.customerName} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-200">{a.customerName}</p>
                    <p className="text-xs text-slate-500">
                      {TYPE_LABELS[a.type] ?? a.type} · {formatDate(a.createdAt)}
                    </p>
                  </div>
                  <Pill className={STATUS_STYLES[a.status] ?? "text-slate-400"}>{STATUS_LABELS[a.status] ?? a.status}</Pill>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </main>
  );
}
