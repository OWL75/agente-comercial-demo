import Link from "next/link";
import { IconArrowLeft } from "@/components/ui/icons";

const AVATAR_GRADIENTS = [
  "from-teal-400 to-cyan-600",
  "from-sky-400 to-indigo-600",
  "from-violet-400 to-fuchsia-600",
  "from-amber-300 to-orange-600",
  "from-emerald-400 to-teal-700",
  "from-rose-400 to-pink-700",
];

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

export function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/).filter((w) => w.length > 2 || /^\p{Lu}/u.test(w));
  return (words.slice(0, 2).map((w) => w[0]).join("") || name.slice(0, 2)).toUpperCase();
}

/** Company avatar: initials on a gradient that is stable for the same name. */
export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "h-8 w-8 text-[11px] rounded-lg", md: "h-10 w-10 text-xs rounded-xl", lg: "h-14 w-14 text-base rounded-2xl" };
  return (
    <span
      className={`inline-grid shrink-0 place-items-center bg-gradient-to-br font-semibold text-white shadow-lg shadow-black/30 ring-1 ring-white/15 ${sizes[size]} ${AVATAR_GRADIENTS[hash(name) % AVATAR_GRADIENTS.length]}`}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  back,
  actions,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  back?: { href: string; label: string };
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-8 animate-fade-up">
      {back && (
        <Link
          href={back.href}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-400 transition hover:text-slate-100"
        >
          <IconArrowLeft className="h-3.5 w-3.5" /> {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow text-teal-300/80">{eyebrow}</p>}
          <h1 className="mt-1.5 text-[1.75rem] font-semibold leading-tight tracking-tight text-white">{title}</h1>
          {description && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function Card({
  title,
  icon,
  action,
  children,
  className = "",
  bodyClassName = "p-5",
}: {
  title?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`surface ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-3.5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            {icon && <span className="text-slate-400">{icon}</span>}
            {title}
          </h2>
          {action}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function Field({ label, value, emphasis = false }: { label: string; value: React.ReactNode; emphasis?: boolean }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className={`mt-1.5 text-sm ${emphasis ? "font-semibold text-white" : "font-medium text-slate-200"}`}>{value}</dd>
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon?: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-white/[0.04] text-slate-500 ring-1 ring-white/[0.06]">{icon}</div>}
      <p className="text-sm font-medium text-slate-300">{title}</p>
      {children && <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500">{children}</p>}
    </div>
  );
}

/** Pill with a colored dot. Tone classes come from labels.ts. */
export function Pill({ className, children, dot = true }: { className: string; children: React.ReactNode; dot?: boolean }) {
  return (
    <span className={`chip ${className}`}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />}
      {children}
    </span>
  );
}

export function timeAgo(value: string | Date): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 10) return "justo ahora";
  if (seconds < 60) return `hace ${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}
