import { CONVERSATION_STAGE_LABELS, CONVERSATION_STAGE_ORDER } from "@/lib/labels";
import { IconCheck } from "@/components/ui/icons";

const SHORT: Record<string, string> = {
  discovery: "Descubrimiento",
  objection_handling: "Objeciones",
  negotiating: "Negociación",
  awaiting_approval: "Aprobación",
  closing: "Cierre",
  closed: "Venta",
};

/** Where the conversation is on the commercial path. */
export function StageStepper({ stage }: { stage: string }) {
  const current = CONVERSATION_STAGE_ORDER.indexOf(stage as (typeof CONVERSATION_STAGE_ORDER)[number]);
  return (
    <ol className="flex items-center gap-1 overflow-x-auto" aria-label={`Etapa: ${CONVERSATION_STAGE_LABELS[stage] ?? stage}`}>
      {CONVERSATION_STAGE_ORDER.map((s, i) => {
        const done = current > i;
        const active = current === i;
        return (
          <li key={s} className="flex shrink-0 items-center gap-1">
            <span
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                active
                  ? "bg-teal-400/15 text-teal-200 ring-1 ring-inset ring-teal-400/30"
                  : done
                    ? "text-slate-300"
                    : "text-slate-600"
              }`}
            >
              <span
                className={`grid h-4 w-4 place-items-center rounded-full text-[9px] ${
                  active ? "bg-teal-300 text-slate-950" : done ? "bg-white/15 text-white" : "bg-white/[0.04] ring-1 ring-white/10"
                }`}
              >
                {done ? <IconCheck className="h-2.5 w-2.5" /> : active ? "●" : ""}
              </span>
              {SHORT[s]}
            </span>
            {i < CONVERSATION_STAGE_ORDER.length - 1 && <span className={`h-px w-4 ${done ? "bg-white/25" : "bg-white/[0.07]"}`} />}
          </li>
        );
      })}
    </ol>
  );
}
