import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getFrequentProducts,
  getOpportunityDetail,
  getPurchaseHistory,
} from "@/lib/db/customer-detail";
import { formatCurrency, formatDate, formatDays } from "@/lib/format";
import {
  PRIORITY_LABELS,
  PRIORITY_STYLES,
  SIGNAL_LABELS,
  STATUS_LABELS,
  STATUS_STYLES,
} from "@/lib/labels";
import { sql } from "@/lib/db";
import { StartConversationButton } from "@/components/start-conversation-button";
import { Avatar, Card, Field, PageHeader, Pill } from "@/components/ui/primitives";
import { IconBox, IconChat, IconClock, IconSliders, IconSpark, IconTarget } from "@/components/ui/icons";
import { startConversationAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function OportunidadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const opportunity = await getOpportunityDetail(id);
  if (!opportunity) notFound();

  const [purchases, frequentProducts, [openConversation]] = await Promise.all([
    getPurchaseHistory(opportunity.customerId),
    getFrequentProducts(opportunity.customerId),
    sql<Array<{ id: string }>>`
      select id from agente_comercial.conversations
      where opportunity_id = ${opportunity.id} and ended_at is null
      order by started_at desc
      limit 1
    `,
  ]);

  const freq = opportunity.avgPurchaseFreqDays;
  const daysSince = opportunity.daysSinceLastPurchase;
  const outOfPattern = opportunity.daysOutOfPattern;
  const maxPurchase = Math.max(1, ...purchases.map((p) => Number(p.amount) || 0));

  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:py-10">
      <PageHeader
        back={{ href: "/oportunidades", label: "Centro de oportunidades" }}
        eyebrow={SIGNAL_LABELS[opportunity.signalType] ?? opportunity.signalType}
        title={
          <span className="flex items-center gap-4">
            <Avatar name={opportunity.customerName} size="lg" />
            <span>
              {opportunity.customerName}
              <span className="mt-1 block text-sm font-normal text-slate-400">{opportunity.segment ?? "Sin segmento"}</span>
            </span>
          </span>
        }
        actions={
          <>
            <Pill className={PRIORITY_STYLES[opportunity.priority]}>Prioridad {PRIORITY_LABELS[opportunity.priority]}</Pill>
            <Pill className={STATUS_STYLES[opportunity.status]}>{STATUS_LABELS[opportunity.status]}</Pill>
          </>
        }
      />

      <div className="surface mb-6 flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-4">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-teal-400/10 text-teal-300 ring-1 ring-inset ring-teal-400/20">
            <IconChat className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-white">
              {openConversation ? "Fernán está conversando con este cliente" : "Listo para contactar por WhatsApp"}
            </p>
            <p className="text-xs text-slate-400">
              Potencial estimado{" "}
              <span className="font-semibold text-slate-200 tabular-nums">
                {formatCurrency(opportunity.potentialLow)} – {formatCurrency(opportunity.potentialHigh)}
              </span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/politicas" className="btn btn-secondary">
            <IconSliders className="h-4 w-4" /> Políticas comerciales
          </Link>
          {openConversation ? (
            <Link href={`/conversaciones/${openConversation.id}`} className="btn btn-primary">
              <IconChat className="h-4 w-4" /> Continuar conversación
            </Link>
          ) : (
            <StartConversationButton action={startConversationAction.bind(null, opportunity.id)} />
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="surface-ai p-5">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-violet-300">
              <IconSpark className="h-3.5 w-3.5" /> Por qué el agente detectó esta oportunidad
            </p>
            <p className="mt-2 text-[15px] leading-relaxed text-slate-200">{opportunity.reasonText}</p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <span className="chip bg-white/[0.05] text-slate-300 ring-1 ring-inset ring-white/[0.08]">
                <IconClock className="h-3 w-3" /> {formatDays(daysSince)} sin comprar
              </span>
              {freq != null && (
                <span className="chip bg-white/[0.05] text-slate-300 ring-1 ring-inset ring-white/[0.08]">Compra cada {freq} días</span>
              )}
              {outOfPattern != null && outOfPattern > 0 && (
                <span className="chip bg-rose-500/10 text-rose-300 ring-1 ring-inset ring-rose-500/20">
                  +{formatDays(outOfPattern)} fuera de patrón
                </span>
              )}
            </div>
            <div className="mt-5 border-t border-white/[0.06] pt-4">
              <p className="eyebrow !text-[10px]">Estrategia sugerida</p>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{opportunity.strategyText}</p>
            </div>
          </section>

          <Card title="Perfil del cliente" icon={<IconTarget className="h-4 w-4" />}>
            <dl className="grid grid-cols-2 gap-5 sm:grid-cols-3">
              <Field label="Última compra" value={formatDate(opportunity.lastPurchaseDate)} />
              <Field label="Frecuencia histórica" value={freq ? `cada ${freq} días` : "—"} />
              <Field label="Ticket promedio" value={formatCurrency(opportunity.avgTicket)} emphasis />
              <Field label="Crédito disponible" value={formatCurrency(opportunity.creditAvailable)} emphasis />
              <Field label="Crédito total" value={formatCurrency(opportunity.creditTotal)} />
              <Field label="Condición de pago" value={opportunity.paymentTerms ?? "—"} />
              <Field label="Canal preferido" value={opportunity.preferredChannel ?? "—"} />
              <Field label="Teléfono" value={opportunity.phone ?? "—"} />
            </dl>
          </Card>

          <Card title="Historial reciente de compras" icon={<IconClock className="h-4 w-4" />}>
            {purchases.length === 0 ? (
              <p className="text-sm text-slate-500">Sin compras registradas.</p>
            ) : (
              <ul className="space-y-3">
                {purchases.map((purchase) => (
                  <li key={purchase.id} className="grid grid-cols-[110px_1fr_90px] items-center gap-4 text-sm">
                    <span className="text-slate-400">{formatDate(purchase.purchaseDate)}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-white/[0.05]">
                      <span
                        className="block h-full rounded-full bg-gradient-to-r from-teal-400 to-sky-400"
                        style={{ width: `${Math.max(4, (Number(purchase.amount) / maxPurchase) * 100)}%` }}
                      />
                    </span>
                    <span className="text-right font-medium text-slate-100 tabular-nums">{formatCurrency(purchase.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Productos frecuentes" icon={<IconBox className="h-4 w-4" />}>
            {frequentProducts.length === 0 ? (
              <p className="text-sm text-slate-500">Sin historial de productos.</p>
            ) : (
              <ul className="space-y-4">
                {frequentProducts.map((product) => (
                  <li key={product.productId} className="text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-slate-100">{product.name}</span>
                      <span className="rounded-md bg-white/[0.05] px-1.5 py-0.5 font-mono text-[11px] text-slate-400">{product.sku}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {product.totalQuantity} unidades compradas · {formatCurrency(product.totalRevenue)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </main>
  );
}
