import Link from "next/link";
import type { OpportunityRow } from "@/lib/db/opportunities";
import { formatCurrency, formatDate, formatDays } from "@/lib/format";
import { PRIORITY_LABELS, PRIORITY_STYLES, SIGNAL_LABELS, STATUS_LABELS, STATUS_STYLES } from "@/lib/labels";
import { Avatar, EmptyState, Pill } from "@/components/ui/primitives";
import { IconArrowRight, IconRadar } from "@/components/ui/icons";

export function OpportunityTable({ rows }: { rows: OpportunityRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState icon={<IconRadar className="h-5 w-5" />} title="Ninguna oportunidad coincide con los filtros">
        Cambie la búsqueda, la prioridad o el estado para ver más clientes.
      </EmptyState>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] border-collapse text-sm">
        <thead>
          <tr className="text-left">
            {["Cliente", "Última compra", "Fuera de patrón", "Ticket promedio", "Potencial", "Prioridad", "Estado", ""].map(
              (h, i) => (
                <th key={i} className="eyebrow whitespace-nowrap border-b border-white/[0.06] px-4 py-3 !text-[10px] font-semibold">
                  {h}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const outOfPattern = row.daysOutOfPattern ?? null;
            return (
              <tr key={row.id} className="group relative border-b border-white/[0.04] transition last:border-0 hover:bg-white/[0.025]">
                <td className="py-3.5 pl-5 pr-4">
                  <Link href={`/oportunidades/${row.id}`} className="flex items-center gap-3 after:absolute after:inset-0">
                    <Avatar name={row.customerName} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-100 group-hover:text-white">{row.customerName}</span>
                      <span className="block truncate text-xs text-slate-500">{SIGNAL_LABELS[row.signalType] ?? row.signalType}</span>
                    </span>
                  </Link>
                </td>
                <td className="whitespace-nowrap px-4 py-3.5">
                  <span className="block text-slate-300">{formatDate(row.lastPurchaseDate)}</span>
                  <span className="block text-xs text-slate-500">{row.avgPurchaseFreqDays ? `compra cada ${row.avgPurchaseFreqDays} días` : "—"}</span>
                </td>
                <td className="px-4 py-3.5">
                  {outOfPattern != null ? (
                    <span
                      className={`chip tabular-nums ${
                        outOfPattern > 0 ? "bg-rose-500/10 text-rose-300 ring-1 ring-inset ring-rose-500/20" : "text-slate-400"
                      }`}
                    >
                      {outOfPattern > 0 ? `+${formatDays(outOfPattern)}` : formatDays(outOfPattern)}
                    </span>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3.5 text-slate-300 tabular-nums">{formatCurrency(row.ticketPromedio)}</td>
                <td className="whitespace-nowrap px-4 py-3.5 font-medium text-white tabular-nums">
                  {formatCurrency(row.potentialLow)} – {formatCurrency(row.potentialHigh)}
                </td>
                <td className="px-4 py-3.5">
                  <Pill className={PRIORITY_STYLES[row.priority]}>{PRIORITY_LABELS[row.priority]}</Pill>
                </td>
                <td className="px-4 py-3.5">
                  <Pill className={STATUS_STYLES[row.status]}>{STATUS_LABELS[row.status]}</Pill>
                </td>
                <td className="px-4 py-3.5 text-right">
                  <IconArrowRight className="inline h-4 w-4 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-teal-300" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
