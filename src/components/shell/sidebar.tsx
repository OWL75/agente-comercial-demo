"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconChat, IconPlay, IconRadar, IconShield, IconSliders, IconSpark } from "@/components/ui/icons";
import { LiveIndicator } from "@/components/live/live-provider";

type NavItem = {
  href: string;
  label: string;
  icon: (p: { className?: string }) => React.ReactNode;
  badge?: { value: number; tone: "teal" | "amber" };
};

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={`group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${
        active
          ? "bg-white/[0.07] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
          : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-100"
      }`}
    >
      {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-gradient-to-b from-teal-300 to-sky-400" />}
      <Icon className={`h-[18px] w-[18px] ${active ? "text-teal-300" : "text-slate-500 group-hover:text-slate-300"}`} />
      <span className="flex-1">{item.label}</span>
      {item.badge && item.badge.value > 0 && (
        <span
          className={`min-w-5 rounded-full px-1.5 py-0.5 text-center text-[11px] font-semibold tabular-nums ${
            item.badge.tone === "amber"
              ? "bg-amber-400/15 text-amber-300 ring-1 ring-inset ring-amber-400/30"
              : "bg-teal-400/15 text-teal-200 ring-1 ring-inset ring-teal-400/25"
          }`}
        >
          {item.badge.value}
        </span>
      )}
    </Link>
  );
}

export function Sidebar({ pendingApprovals, activeConversations }: { pendingApprovals: number; activeConversations: number }) {
  const pathname = usePathname();
  const operation: NavItem[] = [
    { href: "/oportunidades", label: "Oportunidades", icon: IconRadar },
    { href: "/conversaciones", label: "Conversaciones", icon: IconChat, badge: { value: activeConversations, tone: "teal" } },
    { href: "/aprobaciones", label: "Excepciones", icon: IconShield, badge: { value: pendingApprovals, tone: "amber" } },
  ];
  const settings: NavItem[] = [
    { href: "/politicas", label: "Políticas comerciales", icon: IconSliders },
    { href: "/demo", label: "Modo demo", icon: IconPlay },
  ];
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      {/* Desktop */}
      <aside className="sticky top-0 hidden h-screen w-[264px] shrink-0 flex-col border-r border-white/[0.06] bg-ink-950/70 px-4 py-5 backdrop-blur-xl lg:flex">
        <Link href="/oportunidades" className="flex items-center gap-3 px-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-teal-300 via-cyan-400 to-indigo-500 text-slate-950 shadow-lg shadow-teal-500/20">
            <IconSpark className="h-[18px] w-[18px]" />
          </span>
          <span>
            <span className="block text-sm font-semibold tracking-wide text-white">SISTECOMP</span>
            <span className="block text-[11px] text-slate-500">Agente Comercial Autónomo</span>
          </span>
        </Link>

        <div className="mt-6 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2.5">
          <p className="eyebrow !text-[10px]">Espacio de trabajo</p>
          <p className="mt-0.5 text-sm font-medium text-slate-100">Nova Distribution</p>
        </div>

        <nav className="mt-6 space-y-6">
          <div>
            <p className="eyebrow mb-2 px-3 !text-[10px]">Operación</p>
            <div className="space-y-0.5">
              {operation.map((item) => (
                <NavLink key={item.href} item={item} active={isActive(item.href)} />
              ))}
            </div>
          </div>
          <div>
            <p className="eyebrow mb-2 px-3 !text-[10px]">Configuración</p>
            <div className="space-y-0.5">
              {settings.map((item) => (
                <NavLink key={item.href} item={item} active={isActive(item.href)} />
              ))}
            </div>
          </div>
        </nav>

        <div className="mt-auto space-y-3">
          <div className="rounded-2xl border border-white/[0.07] bg-gradient-to-b from-white/[0.05] to-white/[0.015] p-3.5">
            <div className="flex items-center gap-3">
              <span className="relative">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-teal-300 to-sky-500 text-sm font-semibold text-slate-950">
                  F
                </span>
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-ink-950 bg-emerald-400" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">Fernán</p>
                <p className="truncate text-[11px] text-slate-400">Agente comercial IA · activo</p>
              </div>
            </div>
            <p className="mt-3 border-t border-white/[0.06] pt-2.5 text-[11px] leading-relaxed text-slate-500">
              Escala a <span className="text-slate-300">Abdiel</span> por Telegram lo que excede sus reglas.
            </p>
          </div>
          <div className="px-1">
            <LiveIndicator />
          </div>
        </div>
      </aside>

      {/* Mobile / tablet */}
      <div className="sticky top-0 z-30 border-b border-white/[0.06] bg-ink-950/80 backdrop-blur-xl lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/oportunidades" className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-teal-300 via-cyan-400 to-indigo-500 text-slate-950">
              <IconSpark className="h-4 w-4" />
            </span>
            <span className="text-sm font-semibold text-white">SISTECOMP</span>
          </Link>
          <LiveIndicator />
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
          {[...operation, ...settings].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium ${
                isActive(item.href) ? "bg-white/10 text-white" : "text-slate-400"
              }`}
            >
              {item.label}
              {item.badge && item.badge.value > 0 ? ` · ${item.badge.value}` : ""}
            </Link>
          ))}
        </nav>
      </div>
    </>
  );
}
