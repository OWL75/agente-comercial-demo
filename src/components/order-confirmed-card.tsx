import type { OrderSummary } from "@/lib/db/orders";
import type { ConversationClosingStats } from "@/lib/db/conversations";
import { formatCurrency, formatDate } from "@/lib/format";
import { IconCheck, IconCheckCircle } from "@/components/ui/icons";

const CHECKS = ["Cliente", "Inventario", "Precio", "Crédito", "Descuento", "Entrega"];

export function OrderConfirmedCard({
  order,
  stats,
}: {
  order: OrderSummary;
  stats: ConversationClosingStats;
}) {
  return (
    <div className="relative mb-4 overflow-hidden rounded-2xl border border-emerald-400/25 bg-gradient-to-r from-emerald-400/[0.1] via-emerald-400/[0.03] to-transparent px-5 py-4 animate-fade-up">
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-400/10 blur-3xl" />
      <div className="relative flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-400/15 text-emerald-300 ring-1 ring-inset ring-emerald-400/30">
            <IconCheckCircle className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="eyebrow !text-[10px] !text-emerald-300/90">Venta confirmada · demo / sandbox</p>
            <p className="truncate text-sm text-slate-200">
              {order.items.map((item) => `${item.quantity} × ${item.name}`).join(" · ")}
            </p>
            <p className="text-xs text-slate-500">
              Pedido #{order.id.slice(0, 8)} · {formatDate(order.createdAt)} ·{" "}
              {order.discountPct > 0 ? `descuento ${Number(order.discountPct.toFixed(2))}%` : "sin descuento"} · {order.creditTerms ?? "—"} ·{" "}
              {order.deliveryOption ?? "—"}
            </p>
          </div>
        </div>

        <div className="hidden flex-wrap items-center gap-1 2xl:flex">
          {CHECKS.map((label) => (
            <span key={label} className="chip !px-2 bg-emerald-400/10 text-[11px] text-emerald-200 ring-1 ring-inset ring-emerald-400/20">
              <IconCheck className="h-3 w-3" /> {label}
            </span>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-6">
          <div className="hidden text-xs text-slate-400 md:block">
            <p>
              <span className="font-semibold text-slate-200 tabular-nums">{stats.messageCount}</span> mensajes ·{" "}
              {stats.durationMinutes != null && (
                <>
                  <span className="font-semibold text-slate-200 tabular-nums">~{stats.durationMinutes}</span> min
                </>
              )}
            </p>
            <p>
              <span className="font-semibold text-slate-200 tabular-nums">{stats.automatedActions}</span> acciones automáticas ·{" "}
              <span className="font-semibold text-slate-200 tabular-nums">{stats.humanApprovals}</span> aprobación(es)
            </p>
          </div>
          <p className="text-2xl font-semibold tracking-tight text-emerald-300 tabular-nums">{formatCurrency(order.total)}</p>
        </div>
      </div>
    </div>
  );
}
