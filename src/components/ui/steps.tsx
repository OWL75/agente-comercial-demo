import { IconCheck } from "@/components/ui/icons";

/** Vertical list of scheduled steps: sent ones checked, the next one highlighted. */
export function StepList({
  steps,
}: {
  steps: Array<{ key: number; title: string; detail: string; state: "sent" | "next" | "later" }>;
}) {
  return (
    <ol className="space-y-2.5">
      {steps.map((s) => (
        <li key={s.key} className="flex gap-2.5">
          <span
            className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold ${
              s.state === "sent"
                ? "bg-emerald-400/15 text-emerald-300 ring-1 ring-inset ring-emerald-400/30"
                : s.state === "next"
                  ? "bg-amber-400/15 text-amber-300 ring-1 ring-inset ring-amber-400/40"
                  : "text-slate-600 ring-1 ring-inset ring-white/10"
            }`}
          >
            {s.state === "sent" ? <IconCheck className="h-3 w-3" /> : s.key}
          </span>
          <div className="min-w-0">
            <p className={`text-[13px] ${s.state === "later" ? "text-slate-400" : "font-medium text-slate-100"}`}>{s.title}</p>
            <p className="text-[11px] text-slate-500">{s.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
