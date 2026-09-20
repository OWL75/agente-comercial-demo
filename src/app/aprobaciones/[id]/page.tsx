import Link from "next/link";
import { notFound } from "next/navigation";
import { getApprovalDetail } from "@/lib/db/approvals";
import { formatCurrency, formatDate } from "@/lib/format";
import { ApprovalActions } from "@/components/approval-actions";
import { approveAction, modifyAction, rejectAction } from "./actions";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  discount: "Descuento",
  credit: "Crédito",
  delivery: "Entrega",
  other: "Otro",
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-800/70 py-2.5 text-sm last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-100">{value}</span>
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
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/aprobaciones" className="text-sm text-cyan-400 hover:underline">
        ← Excepciones
      </Link>

      <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-amber-400">
          Aprobación comercial · {TYPE_LABELS[type] ?? type}
        </p>
        <h1 className="mt-1 text-xl font-semibold text-slate-50">{approval.customerName}</h1>

        <div className="mt-5">
          {quantity != null && <Row label="Cantidad" value={quantity} />}
          {context.productName && <Row label="Producto" value={`${context.productName} (${context.productSku})`} />}
          {context.listValue != null && <Row label="Valor lista" value={formatCurrency(context.listValue)} />}
          <Row label={`${TYPE_LABELS[type] ?? type} solicitado`} value={requestedLabel} />
          {context.autonomyMaxPct != null && <Row label="Autonomía agente" value={`${context.autonomyMaxPct}%`} />}
          {approval.policyMax != null && (
            <Row label="Máximo aprobable" value={type === "discount" ? `${approval.policyMax}%` : approval.policyMax} />
          )}
          {context.stockAvailable != null && <Row label="Stock disponible" value={context.stockAvailable} />}
          {context.creditAvailable != null && <Row label="Crédito disponible" value={formatCurrency(context.creditAvailable)} />}
        </div>

        <div className="mt-5 space-y-3 rounded-xl bg-slate-950/60 p-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-500">Motivo</p>
            <p className="mt-1 text-sm italic text-slate-300">&ldquo;{context.reason}&rdquo;</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-500">Recomendación del agente</p>
            <p className="mt-1 text-sm italic text-slate-300">&ldquo;{approval.agentRecommendation}&rdquo;</p>
          </div>
        </div>

        <div className="mt-6">
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
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-4 py-3 text-sm text-slate-400">
              Decidida como <span className="font-medium text-slate-200">{approval.status}</span> por{" "}
              {approval.decidedBy} el {formatDate(approval.decidedAt)}.{" "}
              <Link href={`/conversaciones/${approval.conversationId}`} className="text-cyan-400 hover:underline">
                Ver conversación →
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
