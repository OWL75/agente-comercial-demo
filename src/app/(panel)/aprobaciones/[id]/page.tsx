import Link from "next/link";
import { notFound } from "next/navigation";
import { getApprovalDetail } from "@/lib/db/approvals";
import { formatCurrency, formatDate } from "@/lib/format";
import { ApprovalActions } from "@/components/approval-actions";
import { PageHeader } from "@/components/ui/primitives";
import { IconArrowRight, IconShield, IconSpark } from "@/components/ui/icons";
import { approveAction, modifyAction, rejectAction } from "./actions";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  discount: "Descuento",
  credit: "Crédito",
  delivery: "Entrega",
  other: "Otro",
};

const DECISION_LABELS: Record<string, string> = {
  approved: "aprobada",
  modified: "modificada",
  rejected: "rechazada",
};

function Row({ label, value, highlight = false }: { label: string; value: React.ReactNode; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/[0.05] py-3 text-sm last:border-0">
      <span className="text-slate-400">{label}</span>
      <span className={highlight ? "font-semibold text-amber-300" : "font-medium text-slate-100"}>{value}</span>
    </div>
  );
}

export default async function ApprovalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const approval = await getApprovalDetail(id);
  if (!approval) notFound();

  const { requestedValue, context, type } = approval;
  const quantity = (requestedValue.quantity as number | null) ?? context.quantity;
  const requestedLabel =
    type === "discount"
      ? `${requestedValue.pct}%`
      : type === "credit"
        ? formatCurrency(requestedValue.amount as number)
        : type === "delivery"
          ? `${requestedValue.hours} horas`
          : String(requestedValue.description ?? "—");

  return (
    <main className="mx-auto max-w-2xl px-5 py-8 sm:px-8 lg:py-10">
      <PageHeader
        back={{ href: "/aprobaciones", label: "Excepciones" }}
        eyebrow={`Aprobación comercial · ${TYPE_LABELS[type] ?? type}`}
        title={approval.customerName}
      />

      <div className="surface overflow-hidden">
        <div className="flex items-center gap-4 border-b border-white/[0.06] bg-amber-400/[0.04] px-6 py-5">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-400/15 text-amber-300 ring-1 ring-inset ring-amber-400/30">
            <IconShield className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs text-slate-400">{TYPE_LABELS[type] ?? type} solicitado</p>
            <p className="text-2xl font-semibold tracking-tight text-white tabular-nums">{requestedLabel}</p>
          </div>
        </div>

        <div className="px-6 py-2">
          {quantity != null && <Row label="Cantidad" value={quantity} />}
          {context.productName && <Row label="Producto" value={`${context.productName} (${context.productSku})`} />}
          {context.listValue != null && <Row label="Valor lista" value={formatCurrency(context.listValue)} />}
          {context.autonomyMaxPct != null && <Row label="Autonomía del agente" value={`${context.autonomyMaxPct}%`} />}
          {approval.policyMax != null && (
            <Row label="Máximo aprobable" value={type === "discount" ? `${approval.policyMax}%` : approval.policyMax} highlight />
          )}
          {context.stockAvailable != null && <Row label="Stock disponible" value={context.stockAvailable} />}
          {context.creditAvailable != null && <Row label="Crédito disponible" value={formatCurrency(context.creditAvailable)} />}
        </div>

        <div className="mx-6 mb-6 space-y-4 rounded-xl bg-ink-950/50 p-4 ring-1 ring-inset ring-white/[0.05]">
          <div>
            <p className="eyebrow !text-[10px]">Motivo</p>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-300">&ldquo;{context.reason}&rdquo;</p>
          </div>
          <div className="surface-ai p-3.5">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-violet-300">
              <IconSpark className="h-3.5 w-3.5" /> Recomendación del agente
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-200">{approval.agentRecommendation}</p>
          </div>
        </div>

        <div className="border-t border-white/[0.06] px-6 py-5">
          {approval.status === "pending" ? (
            <ApprovalActions
              suggestedValue={
                type === "discount"
                  ? (requestedValue.pct as number | null)
                  : type === "credit"
                    ? (requestedValue.amount as number | null)
                    : type === "delivery"
                      ? (requestedValue.hours as number | null)
                      : null
              }
              onApprove={approveAction.bind(null, approval.id)}
              onModify={modifyAction.bind(null, approval.id)}
              onReject={rejectAction.bind(null, approval.id)}
            />
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
              <p>
                Decisión <span className="font-medium text-slate-100">{DECISION_LABELS[approval.status] ?? approval.status}</span> por{" "}
                {approval.decidedBy} el {formatDate(approval.decidedAt)}.
              </p>
              <Link href={`/conversaciones/${approval.conversationId}`} className="btn btn-secondary !py-2 text-xs">
                Ver conversación <IconArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
