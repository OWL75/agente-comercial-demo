import Link from "next/link";
import type { OpportunityRow } from "@/lib/db/opportunities";
import { formatCurrency, formatDate, formatDays } from "@/lib/format";
import { PRIORITY_LABELS, PRIORITY_STYLES, SIGNAL_LABELS, STATUS_LABELS, STATUS_STYLES } from "@/lib/labels";

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

export function OpportunityTable({ rows }: { rows: OpportunityRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-10 text-center text-sm text-slate-500">
        Ninguna oportunidad coincide con los filtros actuales.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-800">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-800 bg-slate-900/70 text-left text-xs uppercase tracking-wider text-slate-500">
            <th className="px-4 py-3 font-medium">Cliente</th>
            <th className="px-4 py-3 font-medium">Tipo de señal</th>
            <th className="px-4 py-3 font-medium">Última compra</th>
            <th className="px-4 py-3 font-medium">Frecuencia histórica</th>
            <th className="px-4 py-3 font-medium">Días fuera de patrón</th>
            <th className="px-4 py-3 font-medium">Ticket promedio</th>
            <th className="px-4 py-3 font-medium">Potencial estimado</th>
            <th className="px-4 py-3 font-medium">Prioridad</th>
            <th className="px-4 py-3 font-medium">Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/70 bg-slate-950/40">
          {rows.map((row) => {
            const outOfPattern = row.daysOutOfPattern ?? null;
            return (
              <tr key={row.id} className="transition hover:bg-slate-900/60">
                <td className="px-4 py-3">
                  <Link
                    href={`/oportunidades/${row.id}`}
                    className="font-medium text-slate-100 hover:text-cyan-400"
                  >
                    {row.customerName}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-400">
                  {SIGNAL_LABELS[row.signalType] ?? row.signalType}
                </td>
                <td className="px-4 py-3 text-slate-400">{formatDate(row.lastPurchaseDate)}</td>
                <td className="px-4 py-3 text-slate-400">
                  {row.avgPurchaseFreqDays ? `cada ${row.avgPurchaseFreqDays} días` : "—"}
                </td>
                <td className="px-4 py-3">
                  {outOfPattern != null ? (
                    <span className={outOfPattern > 0 ? "text-red-400" : "text-slate-400"}>
                      {outOfPattern > 0 ? `+${formatDays(outOfPattern)}` : formatDays(outOfPattern)}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3 text-slate-300">{formatCurrency(row.ticketPromedio)}</td>
                <td className="px-4 py-3 text-slate-100">
                  {formatCurrency(row.potentialLow)} – {formatCurrency(row.potentialHigh)}
                </td>
                <td className="px-4 py-3">
                  <Badge className={PRIORITY_STYLES[row.priority]}>{PRIORITY_LABELS[row.priority]}</Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge className={STATUS_STYLES[row.status]}>{STATUS_LABELS[row.status]}</Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
