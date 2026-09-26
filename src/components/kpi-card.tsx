import Link from "next/link";

const TONES = {
  teal: { icon: "text-teal-300 bg-teal-400/10 ring-teal-400/20", glow: "from-teal-400/10" },
  emerald: { icon: "text-emerald-300 bg-emerald-400/10 ring-emerald-400/20", glow: "from-emerald-400/10" },
  sky: { icon: "text-sky-300 bg-sky-400/10 ring-sky-400/20", glow: "from-sky-400/10" },
  amber: { icon: "text-amber-300 bg-amber-400/10 ring-amber-400/20", glow: "from-amber-400/10" },
  violet: { icon: "text-violet-300 bg-violet-400/10 ring-violet-400/20", glow: "from-violet-400/10" },
} as const;

export function KpiCard({
  label,
  value,
  hint,
  href,
  icon,
  tone = "teal",
}: {
  label: string;
  value: string;
  hint?: React.ReactNode;
  href?: string;
  icon?: React.ReactNode;
  tone?: keyof typeof TONES;
}) {
  const t = TONES[tone];
  const content = (
    <>
      <div className={`pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br ${t.glow} via-transparent to-transparent opacity-80`} />
      <div className="relative flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-slate-400">{label}</p>
        {icon && <span className={`grid h-8 w-8 place-items-center rounded-lg ring-1 ring-inset ${t.icon}`}>{icon}</span>}
      </div>
      <p className="relative mt-3 text-[1.75rem] font-semibold leading-none tracking-tight text-white tabular-nums">{value}</p>
      {hint && <p className="relative mt-2.5 text-xs text-slate-500">{hint}</p>}
    </>
  );

  const className = "surface relative block overflow-hidden p-5";
  return href ? (
    <Link href={href} className={`${className} surface-hover`}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

export function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-ink-900/80 px-4 py-3">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-slate-100 tabular-nums">{value}</p>
    </div>
  );
}
