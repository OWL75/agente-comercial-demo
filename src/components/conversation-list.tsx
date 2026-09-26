import Link from "next/link";
import type { ConversationListItem } from "@/lib/db/conversations";
import { CONVERSATION_STAGE_LABELS, CONVERSATION_STAGE_STYLES } from "@/lib/labels";
import { formatCurrency } from "@/lib/format";
import { Avatar, EmptyState, Pill, timeAgo } from "@/components/ui/primitives";
import { IconChat, IconShield } from "@/components/ui/icons";
import { TypingDots } from "@/components/ui/typing-dots";

/** The customer wrote in the last two minutes and the agent has not answered yet. */
export function agentIsReplying(item: Pick<ConversationListItem, "lastSender" | "lastAt" | "endedAt">): boolean {
  return item.lastSender === "customer" && item.lastAt != null && Date.now() - new Date(item.lastAt).getTime() < 120_000;
}

/** One line of preview: no WhatsApp bold markers or line breaks. */
function preview(body: string): string {
  return body.replace(/\*+/g, "").replace(/\s*\n+\s*/g, " · ").trim();
}

export function ConversationList({
  items,
  compact = false,
  emptyTitle = "Todavía no hay conversaciones",
}: {
  items: ConversationListItem[];
  compact?: boolean;
  emptyTitle?: string;
}) {
  if (items.length === 0) {
    return (
      <EmptyState icon={<IconChat className="h-5 w-5" />} title={emptyTitle}>
        Abra una oportunidad y pulse «Iniciar conversación» para que Fernán escriba al cliente.
      </EmptyState>
    );
  }

  return (
    <ul className="divide-y divide-white/[0.05]">
      {items.map((item) => {
        const replying = agentIsReplying(item);
        return (
          <li key={item.id}>
            <Link
              href={`/conversaciones/${item.id}`}
              className="group flex items-center gap-4 px-5 py-4 transition hover:bg-white/[0.025]"
            >
              <span className="relative">
                <Avatar name={item.customerName} />
                {!item.endedAt && (
                  <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-ink-900 bg-emerald-400" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-medium text-slate-100 group-hover:text-white">{item.customerName}</p>
                  {item.hasPendingApproval && (
                    <span className="chip !px-2 !py-0.5 bg-amber-400/10 text-[11px] text-amber-300 ring-1 ring-inset ring-amber-400/25">
                      <IconShield className="h-3 w-3" /> Excepción
                    </span>
                  )}
                </div>
                {replying ? (
                  <p className="mt-0.5 flex items-center gap-1.5 text-sm text-teal-300">
                    Fernán está escribiendo
                    <TypingDots />
                  </p>
                ) : (
                  <p className="mt-0.5 truncate text-sm text-slate-500">
                    {item.lastSender === "agent" && <span className="text-slate-400">Fernán: </span>}
                    {item.lastBody ? preview(item.lastBody) : "Sin mensajes todavía"}
                  </p>
                )}
              </div>
              <div className="hidden shrink-0 flex-col items-end gap-1.5 sm:flex">
                <span className="text-xs text-slate-500">{timeAgo(item.lastAt ?? item.startedAt)}</span>
                {item.orderTotal != null ? (
                  <span className="chip bg-emerald-400/10 text-emerald-300 ring-1 ring-inset ring-emerald-400/25">
                    Venta {formatCurrency(item.orderTotal)}
                  </span>
                ) : (
                  !compact && (
                    <Pill className={CONVERSATION_STAGE_STYLES[item.stage] ?? "text-slate-400"}>
                      {CONVERSATION_STAGE_LABELS[item.stage] ?? item.stage}
                    </Pill>
                  )
                )}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

