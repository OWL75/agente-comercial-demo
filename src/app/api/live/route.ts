import { createLiveHub, type LiveHub } from "@/lib/live/hub";
import { workspaceVersion } from "@/lib/live/versions";

// Server-Sent Events: the panel keeps this connection open and refreshes
// itself when the workspace version changes. Behind the demo session (see
// proxy.ts), like the rest of the panel.
export const dynamic = "force-dynamic";

declare global {
  var __liveHub: LiveHub | undefined;
}

function hub(): LiveHub {
  return (globalThis.__liveHub ??= createLiveHub(workspaceVersion, 1000));
}

export async function GET(request: Request) {
  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      send("retry: 3000\n\n");
      const unsubscribe = hub().subscribe((version) => send(`data: ${JSON.stringify({ v: version })}\n\n`));
      // Keeps proxies from closing an idle connection.
      const ping = setInterval(() => send(": ping\n\n"), 15_000);
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed by the client
        }
      };
      request.signal.addEventListener("abort", () => cleanup());
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Streams must not be buffered by a proxy nor held back by compression.
      "X-Accel-Buffering": "no",
      "Content-Encoding": "none",
    },
  });
}
