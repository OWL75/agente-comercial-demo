import { Suspense } from "react";
import Link from "next/link";
import {
  getDashboardKpis,
  listOpportunities,
  type OpportunityPriority,
  type OpportunityStatus,
} from "@/lib/db/opportunities";
import { listConversations } from "@/lib/db/conversations";
import { KpiCard, MiniStat } from "@/components/kpi-card";
import { OpportunityFilters } from "@/components/opportunity-filters";
import { OpportunityTable } from "@/components/opportunity-table";
import { ConversationList } from "@/components/conversation-list";
import { Card, PageHeader } from "@/components/ui/primitives";
import { IconArrowRight, IconChat, IconDollar, IconPlay, IconRadar, IconShield, IconSpark, IconTrendUp } from "@/components/ui/icons";
import { PRIORITY_LABELS, STATUS_LABELS } from "@/lib/labels";
import { formatCurrency } from "@/lib/format";

export const dynamic = "force-dynamic";

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

  const [kpis, opportunities, recent] = await Promise.all([
    getDashboardKpis(),
    listOpportunities({ search: params.search, priority, status }),
    listConversations(4),
  ]);

  return (
    <main className="mx-auto max-w-[1400px] px-5 py-8 sm:px-8 lg:py-10">
      <PageHeader
        eyebrow="Nova Distribution · Panel comercial"
        title={
          <>
            Centro de <span className="text-gradient">oportunidades</span>
          </>
        }
        description="Clientes que dejaron de comprar a su ritmo habitual, detectados y priorizados por el agente. Fernán los contacta por WhatsApp y negocia dentro de las políticas."
        actions={
          <Link href="/demo" className="btn btn-primary">
            <IconPlay className="h-4 w-4" /> Preparar demo en vivo
          </Link>
        }
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Valor potencial"
          value={formatCurrency(kpis.valorPotencial)}
          hint={`${kpis.oportunidadesDetectadas} oportunidades abiertas`}
          icon={<IconTrendUp className="h-4 w-4" />}
          tone="teal"
        />
        <KpiCard
          label="Ventas recuperadas"
          value={formatCurrency(kpis.ventasRecuperadas)}
          hint="Pedidos cerrados por el agente"
          icon={<IconDollar className="h-4 w-4" />}
          tone="emerald"
        />
        <KpiCard
          label="Conversaciones activas"
          value={String(kpis.conversacionesActivas)}
          hint={`${kpis.conversacionesCompletadas} completadas`}
          href="/conversaciones"
          icon={<IconChat className="h-4 w-4" />}
          tone="sky"
        />
        <KpiCard
          label="Excepciones pendientes"
          value={String(kpis.excepcionesPendientes)}
          hint={`${kpis.intervencionHumana} decididas por una persona`}
          href="/aprobaciones"
          icon={<IconShield className="h-4 w-4" />}
          tone="amber"
        />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="surface-ai flex flex-col p-5">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-violet-300">
            <IconSpark className="h-3.5 w-3.5" /> Lo que el agente analizó
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            Revisa el historial de compras de cada cliente y marca a quien lleva más tiempo del habitual sin pedir, con el
            valor que se puede recuperar.
          </p>
          <div className="mt-auto grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-white/[0.06] pt-0 ring-1 ring-white/[0.06]">
            <MiniStat label="Clientes analizados" value={String(kpis.clientesAnalizados)} />
            <MiniStat label="Oportunidades detectadas" value={String(kpis.oportunidadesDetectadas)} />
            <MiniStat label="Conversaciones completadas" value={String(kpis.conversacionesCompletadas)} />
            <MiniStat label="Intervención humana" value={String(kpis.intervencionHumana)} />
          </div>
        </div>

        <Card
          title="Conversaciones recientes"
          icon={<IconChat className="h-4 w-4" />}
          action={
            <Link href="/conversaciones" className="inline-flex items-center gap-1 text-xs font-medium text-teal-300 hover:text-teal-200">
              Ver todas <IconArrowRight className="h-3.5 w-3.5" />
            </Link>
          }
          bodyClassName=""
          className="overflow-hidden"
        >
          <ConversationList items={recent} />
        </Card>
      </section>

      <div className="mt-6">
        <Card
          title="Oportunidades"
          icon={<IconRadar className="h-4 w-4" />}
          action={<span className="text-xs text-slate-500 tabular-nums">{opportunities.length} clientes</span>}
          bodyClassName=""
          className="min-w-0 overflow-hidden"
        >
          <div className="border-b border-white/[0.05] px-5 py-3">
            <Suspense>
              <OpportunityFilters />
            </Suspense>
          </div>
          <OpportunityTable rows={opportunities} />
        </Card>
      </div>
    </main>
  );
}
