"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ConversationMessage } from "@/lib/db/conversations";
import { splitWhatsAppBold } from "@/lib/channel/whatsapp-format";
import { IconCheck, IconSend } from "@/components/ui/icons";
import { TypingDots } from "@/components/ui/typing-dots";

// Fixed business time zone: server and browser render the same hour.
const TIME = new Intl.DateTimeFormat("es-PA", { hour: "numeric", minute: "2-digit", timeZone: "America/Panama" });
const DAY = new Intl.DateTimeFormat("es-PA", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Panama" });
const DAY_KEY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Panama" });

type ChatMessage = ConversationMessage & { sending?: boolean };

function dayLabel(date: Date): string {
  const key = DAY_KEY.format(date);
  const today = DAY_KEY.format(new Date());
  const yesterday = DAY_KEY.format(new Date(Date.now() - 86_400_000));
  if (key === today) return "Hoy";
  if (key === yesterday) return "Ayer";
  const label = DAY.format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function MessageBubble({ message, first }: { message: ChatMessage; first: boolean }) {
  const fromCustomer = message.sender === "customer";
  return (
    <div className={`flex animate-fade-up ${fromCustomer ? "justify-start" : "justify-end"} ${first ? "mt-3" : "mt-1"}`}>
      <div
        className={`relative max-w-[78%] px-3.5 pb-1.5 pt-2 text-[14px] leading-relaxed shadow-sm ${
          fromCustomer
            ? `rounded-2xl bg-[#1b2433] text-slate-100 ring-1 ring-white/[0.05] ${first ? "rounded-tl-md" : ""}`
            : `rounded-2xl bg-gradient-to-br from-teal-600 to-teal-700 text-white ring-1 ring-teal-300/20 ${first ? "rounded-tr-md" : ""}`
        }`}
      >
        {first && (
          <p className={`mb-0.5 text-[11px] font-semibold ${fromCustomer ? "text-sky-300" : "text-teal-100/90"}`}>
            {fromCustomer ? "Cliente" : "Fernán · agente IA"}
          </p>
        )}
        <p className="whitespace-pre-wrap break-words">
          {splitWhatsAppBold(message.body).map((segment, i) =>
            segment.bold ? <strong key={i}>{segment.text}</strong> : <span key={i}>{segment.text}</span>,
          )}
        </p>
        <p className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] ${fromCustomer ? "text-slate-500" : "text-teal-100/70"}`}>
          {message.sending ? "Enviando…" : TIME.format(new Date(message.createdAt))}
          {!fromCustomer && (
            <span className="flex -space-x-1.5 text-sky-200">
              <IconCheck className="h-3 w-3" />
              <IconCheck className="h-3 w-3" />
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

function SendButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-label="Enviar"
      className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-b from-teal-300 to-teal-500 text-slate-950 shadow-lg shadow-teal-500/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <IconSend className="h-[18px] w-[18px]" />
    </button>
  );
}

export function ConversationChat({
  messages,
  ended,
  action,
}: {
  messages: ConversationMessage[];
  ended: boolean;
  action: (formData: FormData) => Promise<void>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [draft, setDraft] = useState("");
  // Messages typed here and not yet seen coming back from the server.
  const [sent, setSent] = useState<Array<{ id: string; body: string; at: number }>>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  const pendingSent = useMemo(
    () =>
      sent.filter(
        (s) => !messages.some((m) => m.sender === "customer" && m.body === s.body && new Date(m.createdAt).getTime() >= s.at - 60_000),
      ),
    [sent, messages],
  );

  const shown: ChatMessage[] = useMemo(
    () => [
      ...messages,
      ...pendingSent.map((s) => ({
        id: s.id,
        direction: "inbound" as const,
        sender: "customer" as const,
        body: s.body,
        createdAt: new Date(s.at).toISOString(),
        sending: true,
      })),
    ],
    [messages, pendingSent],
  );

  const last = shown.at(-1);
  const agentTyping =
    !ended && last?.sender === "customer" && (last.sending || now - new Date(last.createdAt).getTime() < 120_000);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [shown.length, agentTyping]);

  async function submit(formData: FormData) {
    const text = String(formData.get("text") ?? "").trim();
    if (!text) return;
    const at = Date.now();
    setSent((current) => [...current, { id: `local-${at}`, body: text, at }]);
    setDraft("");
    await action(formData);
  }

  let lastDay = "";
  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="chat-wallpaper flex-1 overflow-y-auto px-4 pb-4 pt-2 sm:px-6">
        {shown.length === 0 ? (
          <p className="mt-10 text-center text-sm text-slate-500">Sin mensajes todavía.</p>
        ) : (
          shown.map((m, i) => {
            const date = new Date(m.createdAt);
            const day = dayLabel(date);
            const separator = day !== lastDay;
            lastDay = day;
            const first = separator || shown[i - 1]?.sender !== m.sender;
            return (
              <div key={m.id}>
                {separator && (
                  <div className="my-4 flex justify-center">
                    <span className="rounded-full bg-ink-800/90 px-3 py-1 text-[11px] font-medium text-slate-400 ring-1 ring-white/[0.06]">
                      {day}
                    </span>
                  </div>
                )}
                <MessageBubble message={m} first={first} />
              </div>
            );
          })
        )}
        {agentTyping && (
          <div className="mt-3 flex justify-end animate-fade-up">
            <div className="flex items-center gap-2 rounded-2xl rounded-tr-md bg-teal-700/60 px-3.5 py-2.5 text-xs text-teal-50 ring-1 ring-teal-300/15">
              Fernán está escribiendo <TypingDots />
            </div>
          </div>
        )}
      </div>
      <form ref={formRef} action={submit} className="flex items-center gap-2 border-t border-white/[0.06] bg-ink-900/60 p-3">
        <input
          name="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={ended}
          placeholder={ended ? "Esta conversación ya terminó" : "Escriba como si fuera el cliente…"}
          autoComplete="off"
          className="input !rounded-full !px-5 !py-3"
        />
        {!ended && <SendButton disabled={!draft.trim()} />}
      </form>
    </div>
  );
}
