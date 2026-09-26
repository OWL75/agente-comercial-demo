/**
 * One poller per server process, shared by every open panel: the database
 * is asked once per interval no matter how many browsers are watching, and
 * only while at least one is. Listeners hear the current version when they
 * subscribe and every time it changes.
 */
export type VersionListener = (version: string) => void;

export type LiveHub = {
  subscribe(listener: VersionListener): () => void;
  readonly size: number;
};

export function createLiveHub(read: () => Promise<string>, intervalMs = 1000): LiveHub {
  const listeners = new Set<VersionListener>();
  let version: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let polling = false;

  async function tick() {
    timer = null;
    if (polling || listeners.size === 0) return;
    polling = true;
    try {
      const next = await read();
      if (next !== version) {
        version = next;
        for (const listener of listeners) listener(next);
      }
    } catch (error) {
      console.error("[live] no se pudo leer la versión:", error instanceof Error ? error.message : error);
    } finally {
      polling = false;
      if (listeners.size > 0 && !timer) timer = setTimeout(tick, intervalMs);
    }
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (version !== null) listener(version);
      if (!timer && !polling) timer = setTimeout(tick, 0);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          if (timer) clearTimeout(timer);
          timer = null;
          version = null;
        }
      };
    },
    get size() {
      return listeners.size;
    },
  };
}
