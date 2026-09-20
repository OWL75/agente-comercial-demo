import Link from "next/link";

export function KpiCard({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  href?: string;
}) {
  const content = (
    <>
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-50">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="block rounded-xl border border-slate-800 bg-slate-900/50 p-4 transition hover:border-slate-600"
      >
        {content}
      </Link>
    );
  }

  return <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">{content}</div>;
}
