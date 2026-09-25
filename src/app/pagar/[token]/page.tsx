import { notFound } from "next/navigation";
import { findPayment } from "@/lib/payments/payments";
import { formatDateEs, creditDays } from "@/lib/payments/payment-messages";
import { payAction, reportIssueAction } from "./actions";

export const dynamic = "force-dynamic";

const money = (value: number) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const METHODS: Array<{ id: string; label: string; detail: string }> = [
  { id: "tarjeta", label: "Tarjeta de crédito o débito", detail: "Visa, Mastercard" },
  { id: "yappy", label: "Yappy", detail: "Pago desde su app de Banco General" },
  { id: "transferencia", label: "Transferencia ACH", detail: "Confirmación inmediata con ACH Inmediato" },
];

export default async function PaymentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const payment = await findPayment(token);
  if (!payment) notFound();
  const paid = payment.status === "pagado";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-5 px-4 py-8">
      <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
        Entorno de prueba: esta página simula el cobro. No se procesa dinero real.
      </p>

      <header>
        <p className="text-sm font-semibold tracking-wide text-slate-100">Nova Distribution</p>
        <p className="text-xs text-slate-400">Pedido #{payment.orderShort} · {payment.customerName}</p>
      </header>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-slate-400">Total a pagar</span>
          <span className="text-2xl font-semibold text-slate-100">{money(payment.total)}</span>
        </div>
        <dl className="mt-4 space-y-1.5 text-sm text-slate-300">
          <div className="flex justify-between gap-4"><dt className="text-slate-400">Producto</dt><dd className="text-right">{payment.quantity} × {payment.productName}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-slate-400">Precio por unidad</dt><dd>{money(payment.netUnitPrice)}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-slate-400">Entrega</dt><dd>{payment.deliveryOption}</dd></div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-400">Condición</dt>
            <dd className="text-right">{creditDays(payment.terms) > 0 ? `Crédito a ${payment.terms}, vence el ${formatDateEs(payment.dueDate)}` : "Contado"}</dd>
          </div>
        </dl>
      </section>

      {paid ? (
        <section className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-5 text-sm text-emerald-100">
          <p className="font-semibold">Pago recibido. ¡Gracias!</p>
          <p className="mt-1 text-emerald-200/80">Le enviamos la confirmación por WhatsApp.</p>
        </section>
      ) : (
        <section className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Elija cómo pagar</p>
          {METHODS.map((method) => (
            <form key={method.id} action={payAction.bind(null, token, method.id)}>
              <button
                type="submit"
                className="flex w-full items-center justify-between rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-left transition hover:border-cyan-500"
              >
                <span>
                  <span className="block text-sm font-medium text-slate-100">{method.label}</span>
                  <span className="block text-xs text-slate-400">{method.detail}</span>
                </span>
                <span className="text-sm font-semibold text-cyan-300">Pagar {money(payment.total)}</span>
              </button>
            </form>
          ))}
        </section>
      )}

      {!paid && (
        <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
          {payment.issueReported ? (
            <p className="text-sm text-slate-300">Recibimos su consulta. Fernán le escribe por WhatsApp en breve.</p>
          ) : (
            <form action={reportIssueAction.bind(null, token)} className="space-y-3">
              <label htmlFor="issue" className="block text-sm font-medium text-slate-200">¿Necesita pagar de otra forma o tiene un problema?</label>
              <textarea
                id="issue"
                name="issue"
                required
                minLength={3}
                maxLength={500}
                rows={3}
                placeholder="Por ejemplo: prefiero pagar con cheque, o en dos partes"
                className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
              />
              <button type="submit" className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:border-cyan-500">
                Hablar con alguien
              </button>
            </form>
          )}
        </section>
      )}
    </main>
  );
}
