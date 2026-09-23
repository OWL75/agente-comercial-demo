import { Suspense } from "react";
import {
  getDashboardKpis,
  listOpportunities,
  type OpportunityPriority,
  type OpportunityStatus,
} from "@/lib/db/opportunities";
import { KpiCard } from "@/components/kpi-card";
import { OpportunityFilters } from "@/components/opportunity-filters";
import { OpportunityTable } from "@/components/opportunity-table";
import { PRIORITY_LABELS, STATUS_LABELS } from "@/lib/labels";
import { formatCurrency } from "@/lib/format";
import Link from "next/link";

const VALID_PRIORITIES = new Set(Object.keys(PRIORITY_LABELS));
const VALID_STATUSES = new Set(Object.keys(STATUS_LABELS));

export default async function OportunidadesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; priority?: string; status?: string }>;
}) {
  const params = await searchParams;
  const priority = VALID_PRIORITIES.has(params.priority ?? "")
    ? (params.priority as OpportunityPriority)
    : undefined;
  const status = VALID_STATUSES.has(params.status ?? "")
    ? (params.status as OpportunityStatus)
    : undefined;

  const [kpis, opportunities] = await Promise.all([
    getDashboardKpis(),
    listOpportunities({ search: params.search, priority, status }),
  ]);

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-cyan-400">
            SISTECOMP · Nova Distribution
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-50">Centro de Oportunidades</h1>
        </div>
        <Link
          href="/demo"
          className="rounded-lg border border-cyan-500/50 px-4 py-2.5 text-sm font-semibold text-cyan-300 transition hover:border-cyan-400 hover:bg-cyan-500/10"
        >
          Preparar demo en vivo
        </Link>
      </header>

      <section className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard label="Clientes analizados" value={String(kpis.clientesAnalizados)} />
        <KpiCard label="Oportunidades detectadas" value={String(kpis.oportunidadesDetectadas)} />
        <KpiCard label="Valor potencial" value={formatCurrency(kpis.valorPotencial)} />
        <KpiCard label="Conversaciones activas" value={String(kpis.conversacionesActivas)} />
        <KpiCard label="Conversaciones completadas" value={String(kpis.conversacionesCompletadas)} />
        <KpiCard label="Ventas recuperadas" value={formatCurrency(kpis.ventasRecuperadas)} />
        <KpiCard label="Excepciones pendientes" value={String(kpis.excepcionesPendientes)} href="/aprobaciones" />
        <KpiCard label="Intervención humana" value={String(kpis.intervencionHumana)} href="/aprobaciones" />
      </section>

      <section className="mb-4">
        <Suspense>
          <OpportunityFilters />
        </Suspense>
      </section>

      <OpportunityTable rows={opportunities} />
    </main>
  );
}
