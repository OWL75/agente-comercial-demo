"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  IconChat,
  IconPanelLeft,
  IconPanelRight,
  IconPlay,
  IconRadar,
  IconShield,
  IconSliders,
  IconSpark,
} from "@/components/ui/icons";
import { LiveIndicator } from "@/components/live/live-provider";
import { SIDEBAR_COOKIE } from "@/components/shell/sidebar-state";


type NavItem = {
  href: string;
  label: string;
  icon: (p: { className?: string }) => React.ReactNode;
  badge?: { value: number; tone: "teal" | "amber" };
};

const BADGE_TONES = {
  amber: "bg-amber-400/15 text-amber-300 ring-1 ring-inset ring-amber-400/30",
  teal: "bg-teal-400/15 text-teal-200 ring-1 ring-inset ring-teal-400/25",
};

function NavLink({ item, active, collapsed }: { item: NavItem; active: boolean; collapsed: boolean }) {
  const Icon = item.icon;
  const badge = item.badge && item.badge.value > 0 ? item.badge : null;
  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={`group relative flex items-center rounded-xl py-2 text-sm font-medium transition ${
        collapsed ? "justify-center px-0" : "gap-3 px-3"
      } ${
        active
          ? "bg-white/[0.07] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
          : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-100"
      }`}
    >
      {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-gradient-to-b from-teal-300 to-sky-400" />}
      <span className="relative">
        <Icon className={`h-[18px] w-[18px] ${active ? "text-teal-300" : "text-slate-500 group-hover:text-slate-300"}`} />
        {collapsed && badge && (
          <span
            className={`absolute -right-2.5 -top-2 min-w-4 rounded-full px-1 text-center text-[9px] font-semibold leading-4 tabular-nums ${BADGE_TONES[badge.tone]}`}
          >
            {badge.value}
          </span>
        )}
      </span>
      {!collapsed && <span className="flex-1">{item.label}</span>}
      {!collapsed && badge && (
        <span className={`min-w-5 rounded-full px-1.5 py-0.5 text-center text-[11px] font-semibold tabular-nums ${BADGE_TONES[badge.tone]}`}>
          {badge.value}
        </span>
      )}
    </Link>
  );
}

function Logo({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <span
      className={`grid shrink-0 place-items-center bg-gradient-to-br from-teal-300 via-cyan-400 to-indigo-500 text-slate-950 shadow-lg shadow-teal-500/20 ${
        size === "md" ? "h-9 w-9 rounded-xl" : "h-8 w-8 rounded-lg"
      }`}
    >
      <IconSpark className={size === "md" ? "h-[18px] w-[18px]" : "h-4 w-4"} />
    </span>
  );
}

export function Sidebar({
  pendingApprovals,
  activeConversations,
  initialCollapsed = false,
}: {
  pendingApprovals: number;
  activeConversations: number;
  initialCollapsed?: boolean;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  const toggle = useCallback(() => {
    setCollapsed((current) => !current);
  }, []);

  useEffect(() => {
    document.cookie = `${SIDEBAR_COOKIE}=${collapsed ? "collapsed" : "expanded"}; path=/; max-age=31536000; samesite=lax`;
  }, [collapsed]);

  // Ctrl/⌘ + B, as in most modern apps.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

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
  const toggleLabel = collapsed ? "Mostrar menú (Ctrl+B)" : "Ocultar menú (Ctrl+B)";

  return (
    <>
      {/* Desktop */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-white/[0.06] bg-ink-950/70 py-5 backdrop-blur-xl transition-[width,padding] duration-200 ease-out lg:flex ${
          collapsed ? "w-[72px] px-3" : "w-[264px] px-4"
        }`}
      >
        <div className={`flex items-center ${collapsed ? "flex-col gap-3" : "justify-between gap-2 px-2"}`}>
          <Link href="/oportunidades" className="flex min-w-0 items-center gap-3" title={collapsed ? "SISTECOMP" : undefined}>
            <Logo />
            {!collapsed && (
              <span className="min-w-0">
                <span className="block text-sm font-semibold tracking-wide text-white">SISTECOMP</span>
                <span className="block truncate text-[11px] text-slate-500">Agente Comercial Autónomo</span>
              </span>
            )}
          </Link>
          <button
            type="button"
            onClick={toggle}
            title={toggleLabel}
            aria-label={toggleLabel}
            aria-expanded={!collapsed}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-white/[0.06] hover:text-slate-200"
          >
            {collapsed ? <IconPanelRight className="h-[18px] w-[18px]" /> : <IconPanelLeft className="h-[18px] w-[18px]" />}
          </button>
        </div>

        {!collapsed && (
          <div className="mt-6 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2.5">
            <p className="eyebrow !text-[10px]">Espacio de trabajo</p>
            <p className="mt-0.5 text-sm font-medium text-slate-100">Nova Distribution</p>
          </div>
        )}

        <nav className={collapsed ? "mt-5 space-y-5" : "mt-6 space-y-6"}>
          {[
            { title: "Operación", items: operation },
            { title: "Configuración", items: settings },
          ].map((group) => (
            <div key={group.title}>
              {collapsed ? (
                <div className="mx-auto mb-2 h-px w-6 bg-white/[0.08]" />
              ) : (
                <p className="eyebrow mb-2 px-3 !text-[10px]">{group.title}</p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink key={item.href} item={item} active={isActive(item.href)} collapsed={collapsed} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className={`mt-auto ${collapsed ? "flex flex-col items-center gap-3" : "space-y-3"}`}>
          {collapsed ? (
            <span className="relative" title="Fernán · agente comercial IA activo">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-teal-300 to-sky-500 text-sm font-semibold text-slate-950">
                F
              </span>
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-ink-950 bg-emerald-400" />
            </span>
          ) : (
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
          )}
          <div className={collapsed ? "" : "px-1"}>
            <LiveIndicator dotOnly={collapsed} />
          </div>
        </div>
      </aside>

      {/* Mobile / tablet */}
      <div className="sticky top-0 z-30 border-b border-white/[0.06] bg-ink-950/80 backdrop-blur-xl lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/oportunidades" className="flex items-center gap-2.5">
            <Logo size="sm" />
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
