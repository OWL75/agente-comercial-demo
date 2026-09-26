"use client";

import { createContext, startTransition, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export type LiveStatus = "connecting" | "live" | "offline";

const LiveContext = createContext<LiveStatus>("connecting");

export function useLiveStatus(): LiveStatus {
  return useContext(LiveContext);
}

/**
 * Keeps one Server-Sent Events connection open (/api/live). When the
 * workspace version changes, the current route is refreshed in place: new
 * messages, activity and counters appear without reloading the page, and
 * client state (what is being typed, scroll) is kept.
 */
export function LiveProvider({ initialVersion, children }: { initialVersion: string | null; children: React.ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<LiveStatus>("connecting");

  useEffect(() => {
    let last = initialVersion;
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let cooling = false;
    let queued = false;
    let disposed = false;

    // At most one refresh every 600 ms; a burst of changes ends in one last refresh.
    const refresh = () => {
      if (cooling) {
        queued = true;
        return;
      }
      cooling = true;
      startTransition(() => router.refresh());
      setTimeout(() => {
        cooling = false;
        if (queued) {
          queued = false;
          refresh();
        }
      }, 600);
    };

    const connect = () => {
      if (disposed) return;
      source = new EventSource("/api/live");
      source.onopen = () => setStatus("live");
      source.onmessage = (event) => {
        try {
          const { v } = JSON.parse(event.data) as { v: string };
          if (last !== null && v !== last) refresh();
          last = v;
          setStatus("live");
        } catch {
          // ignore malformed events
        }
      };
      source.onerror = () => {
        if (!source) return;
        if (source.readyState === EventSource.CLOSED) {
          // The browser gave up (e.g. the session expired): try again later.
          setStatus("offline");
          source.close();
          retry = setTimeout(connect, 5000);
        } else {
          setStatus("connecting");
        }
      };
    };

    connect();
    return () => {
      disposed = true;
      if (retry) clearTimeout(retry);
      source?.close();
    };
    // initialVersion only seeds the first comparison.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  return <LiveContext.Provider value={status}>{children}</LiveContext.Provider>;
}

export function LiveIndicator({ compact = false }: { compact?: boolean }) {
  const status = useLiveStatus();
  const label = status === "live" ? "En vivo" : status === "connecting" ? "Conectando…" : "Sin conexión";
  const dot =
    status === "live" ? "bg-emerald-400 animate-live" : status === "connecting" ? "bg-amber-400" : "bg-slate-500";
  return (
    <span
      className={`chip ${compact ? "" : "bg-white/[0.04] ring-1 ring-inset ring-white/[0.08]"} text-slate-300`}
      title={status === "live" ? "Los cambios aparecen al instante, sin recargar." : undefined}
    >
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
