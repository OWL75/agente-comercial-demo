import type { OrderSummary } from "@/lib/db/orders";
import type { ConversationClosingStats } from "@/lib/db/conversations";
import { formatCurrency, formatDate } from "@/lib/format";

const CHECKS = ["Cliente", "Inventario", "Precio", "Crédito", "Descuento", "Entrega"];

export function OrderConfirmedCard({
  order,
  stats,
}: {
  order: OrderSummary;
  stats: ConversationClosingStats;
}) {
  return (
    <div className="mb-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400">
            Venta confirmada · Demo / Sandbox
          </p>
          <h2 className="mt-1 text-lg font-semibold text-slate-50">{order.customerName}</h2>
        </div>
        <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
          Pedido #{order.id.slice(0, 8)} · {formatDate(order.createdAt)}
        </span>
      </div>

      <ul className="mt-4 space-y-1 text-sm text-slate-200">
        {order.items.map((item) => (
          <li key={item.sku}>
            {item.quantity} × {item.name}{" "}
            <span className="text-slate-500">({formatCurrency(item.unitPrice)} c/u)</span>
          </li>
        ))}
      </ul>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <dt className="text-xs uppercase tracking-wider text-slate-500">Subtotal</dt>
          <dd className="mt-0.5 font-medium text-slate-100">{formatCurrency(order.subtotal)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-slate-500">Descuento</dt>
          <dd className="mt-0.5 font-medium text-slate-100">{order.discountPct}%</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-slate-500">Total</dt>
          <dd className="mt-0.5 font-semibold text-emerald-300">{formatCurrency(order.total)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-slate-500">Crédito / Entrega</dt>
          <dd className="mt-0.5 font-medium text-slate-100">
            {order.creditTerms ?? "—"} · {order.deliveryOption ?? "—"}
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-emerald-500/20 pt-3">
        {CHECKS.map((label) => (
          <span key={label} className="flex items-center gap-1.5 text-xs text-emerald-300">
            <span aria-hidden>✓</span> {label}
          </span>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
        <span>{stats.messageCount} mensajes</span>
        <span>{stats.durationMinutes != null ? `~${stats.durationMinutes} min de conversación` : "—"}</span>
        <span>{stats.automatedActions} acciones automáticas</span>
        <span>{stats.humanApprovals} aprobación(es) humana(s)</span>
      </div>
    </div>
  );
}
