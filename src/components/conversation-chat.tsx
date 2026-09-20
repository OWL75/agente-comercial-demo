"use client";

import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import type { ConversationMessage } from "@/lib/db/conversations";

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("es-419", { hour: "2-digit", minute: "2-digit" });
}

function MessageBubble({ message }: { message: ConversationMessage }) {
  const fromCustomer = message.sender === "customer";
  return (
    <div className={`flex ${fromCustomer ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          fromCustomer
            ? "rounded-bl-sm bg-slate-800 text-slate-100"
            : "rounded-br-sm bg-cyan-600 text-white"
        }`}
      >
        <p className="whitespace-pre-wrap">{message.body}</p>
        <p className={`mt-1 text-[10px] ${fromCustomer ? "text-slate-500" : "text-cyan-100/70"}`}>
          {formatTime(message.createdAt)}
        </p>
      </div>
    </div>
  );
}

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-wait disabled:opacity-70"
    >
      {pending ? "Enviando…" : "Enviar"}
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

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <p className="text-center text-sm text-slate-600">Sin mensajes todavía.</p>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}
      </div>
      <form action={action} className="flex items-center gap-2 border-t border-slate-800 p-3">
        <input
          name="text"
          disabled={ended}
          placeholder={ended ? "Esta conversación ya terminó" : "Escribe como si fueras el cliente…"}
          autoComplete="off"
          className="flex-1 rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 disabled:opacity-50"
        />
        {!ended && <SendButton />}
      </form>
    </div>
  );
}
