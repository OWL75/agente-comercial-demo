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
import { startConversationAction } from "./actions";

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

function Card({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-slate-800 bg-slate-900/50 p-5 ${className}`}>
      {title && <h2 className="mb-3 text-sm font-semibold text-slate-100">{title}</h2>}
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-slate-100">{value}</dd>
    </div>
  );
}

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

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <Link href="/oportunidades" className="text-sm text-cyan-400 hover:underline">
        ← Centro de Oportunidades
      </Link>

      <header className="mt-4 mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-cyan-400">
            SISTECOMP · Nova Distribution
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-50">{opportunity.customerName}</h1>
          <p className="mt-1 text-sm text-slate-500">{opportunity.segment ?? "Sin segmento"}</p>
        </div>
        <div className="flex gap-2">
          <Badge className={PRIORITY_STYLES[opportunity.priority]}>
            Prioridad {PRIORITY_LABELS[opportunity.priority]}
          </Badge>
          <Badge className={STATUS_STYLES[opportunity.status]}>
            {STATUS_LABELS[opportunity.status]}
          </Badge>
        </div>
      </header>

      <div className="mb-6 flex flex-wrap gap-3">
        {openConversation ? (
          <Link
            href={`/conversaciones/${openConversation.id}`}
            className="rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
          >
            Continuar conversación
          </Link>
        ) : (
          <StartConversationButton action={startConversationAction.bind(null, opportunity.id)} />
        )}
        <Link
          href="/politicas"
          className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
        >
          Ver políticas comerciales
        </Link>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Perfil del cliente">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Field label="Última compra" value={formatDate(opportunity.lastPurchaseDate)} />
              <Field
                label="Frecuencia histórica"
                value={freq ? `cada ${freq} días` : "—"}
              />
              <Field label="Ticket promedio" value={formatCurrency(opportunity.avgTicket)} />
              <Field
                label="Potencial estimado"
                value={`${formatCurrency(opportunity.potentialLow)} – ${formatCurrency(opportunity.potentialHigh)}`}
              />
              <Field label="Crédito disponible" value={formatCurrency(opportunity.creditAvailable)} />
              <Field label="Crédito total" value={formatCurrency(opportunity.creditTotal)} />
              <Field label="Condición de pago" value={opportunity.paymentTerms ?? "—"} />
              <Field label="Canal preferido" value={opportunity.preferredChannel ?? "—"} />
              <Field label="Teléfono" value={opportunity.phone ?? "—"} />
            </dl>
          </Card>

          <Card title="¿Por qué el agente detectó esta oportunidad?">
            <p className="text-sm leading-relaxed text-slate-300">{opportunity.reasonText}</p>
            <p className="mt-3 text-xs text-slate-500">
              Señal: {SIGNAL_LABELS[opportunity.signalType] ?? opportunity.signalType} · Lleva{" "}
              {formatDays(daysSince)} sin una nueva compra
              {freq != null && ` (frecuencia habitual: cada ${freq} días)`}
              {outOfPattern != null && outOfPattern > 0 && (
                <span className="text-red-400"> · {formatDays(outOfPattern)} fuera de patrón</span>
              )}
              .
            </p>
          </Card>

          <Card title="Estrategia sugerida">
            <p className="text-sm leading-relaxed text-slate-300">{opportunity.strategyText}</p>
          </Card>

          <Card title="Historial reciente de compras">
            {purchases.length === 0 ? (
              <p className="text-sm text-slate-500">Sin compras registradas.</p>
            ) : (
              <ul className="divide-y divide-slate-800/70">
                {purchases.map((purchase) => (
                  <li key={purchase.id} className="flex items-center justify-between py-2.5 text-sm">
                    <span className="text-slate-400">{formatDate(purchase.purchaseDate)}</span>
                    <span className="font-medium text-slate-100">{formatCurrency(purchase.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Productos frecuentes">
            {frequentProducts.length === 0 ? (
              <p className="text-sm text-slate-500">Sin historial de productos.</p>
            ) : (
              <ul className="space-y-3">
                {frequentProducts.map((product) => (
                  <li key={product.productId} className="text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-100">{product.name}</span>
                      <span className="text-slate-500">{product.sku}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
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
