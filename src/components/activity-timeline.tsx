import type { AgentActivityEntry } from "@/lib/db/conversations";
import { AUDIT_CATEGORY_LABELS } from "@/lib/labels";
import { timeAgo } from "@/components/ui/primitives";
import { IconBan, IconCart, IconCpu, IconShield, IconSliders, IconTool } from "@/components/ui/icons";

const CATEGORY: Record<string, { icon: (p: { className?: string }) => React.ReactNode; tone: string }> = {
  tool_call: { icon: IconTool, tone: "text-violet-300 bg-violet-400/10 ring-violet-400/20" },
  policy_check: { icon: IconSliders, tone: "text-sky-300 bg-sky-400/10 ring-sky-400/20" },
  approval_decided: { icon: IconShield, tone: "text-amber-300 bg-amber-400/10 ring-amber-400/20" },
  order_created: { icon: IconCart, tone: "text-emerald-300 bg-emerald-400/10 ring-emerald-400/20" },
  opt_out: { icon: IconBan, tone: "text-rose-300 bg-rose-400/10 ring-rose-400/20" },
  system: { icon: IconCpu, tone: "text-slate-300 bg-white/[0.05] ring-white/10" },
};

/** What the agent did, newest first: every tool call, check and decision is on record. */
export function ActivityTimeline({ entries }: { entries: AgentActivityEntry[] }) {
  if (entries.length === 0) return <p className="text-sm text-slate-500">Sin actividad todavía.</p>;
  return (
    <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[13px] before:top-2 before:w-px before:bg-white/[0.06]">
      {entries.map((entry, i) => {
        const c = CATEGORY[entry.category] ?? CATEGORY.system;
        const Icon = c.icon;
        return (
          <li key={entry.id} className={`relative flex gap-3 ${i === 0 ? "animate-fade-up" : ""}`}>
            <span className={`relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-lg ring-1 ring-inset ${c.tone}`}>
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="text-[13px] leading-snug text-slate-200">{entry.label}</p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {AUDIT_CATEGORY_LABELS[entry.category] ?? entry.category} · {timeAgo(entry.createdAt)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
