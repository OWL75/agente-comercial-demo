import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAgentActivity,
  getConversationClosingStats,
  getConversationContext,
  getConversationMessages,
} from "@/lib/db/conversations";
import { getFrequentProducts } from "@/lib/db/customer-detail";
import { getOrderForConversation } from "@/lib/db/orders";
import { formatCurrency } from "@/lib/format";
import { AUDIT_CATEGORY_LABELS, CONVERSATION_STAGE_LABELS } from "@/lib/labels";
import { ConversationChat } from "@/components/conversation-chat";
import { OrderConfirmedCard } from "@/components/order-confirmed-card";
import { FollowUpPanel } from "@/components/follow-up-panel";
import { getFollowUpState } from "@/lib/agent/follow-up";
import { FOLLOW_UP_STEPS } from "@/lib/agent/follow-up-sequence";
import { PaymentReminderPanel } from "@/components/payment-reminder-panel";
import { getPaymentReminderState } from "@/lib/payments/payments";
import { formatDateEs, money } from "@/lib/payments/payment-messages";
import { sendMessageAction, simulateAgreedFollowUpAction, simulateNoReplyAction, simulatePaymentReminderAction } from "./actions";

export const dynamic = "force-dynamic";

function Panel({
  title,
  children,
  className = "",
  flush = false,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  /** Skip the padded, scrollable content wrapper — used by the chat panel,
   * which manages its own internal scroll region and a sticky input bar. */
  flush?: boolean;
}) {
  return (
    <section
      className={`flex flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40 ${className}`}
    >
      <h2 className="border-b border-slate-800 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
        {title}
      </h2>
      {flush ? (
        <div className="flex-1 overflow-hidden">{children}</div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      )}
    </section>
  );
}

function timeAgo(value: string): string {
  const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 5) return "justo ahora";
  if (seconds < 60) return `hace ${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `hace ${hours} h`;
}

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getConversationContext(id);
  if (!context) notFound();

  const [messages, activity, frequentProducts, order, followUp, payment] = await Promise.all([
    getConversationMessages(id),
    getAgentActivity(id),
    getFrequentProducts(context.customerId),
    getOrderForConversation(id),
    getFollowUpState(id),
    getPaymentReminderState(id),
  ]);

  const closingStats = order ? await getConversationClosingStats(id) : null;
  const boundSendMessage = sendMessageAction.bind(null, id);
  const boundSimulateNoReply = simulateNoReplyAction.bind(null, id);
  const boundSimulateAgreed = simulateAgreedFollowUpAction.bind(null, id);
  const boundSimulatePaymentReminder = simulatePaymentReminderAction.bind(null, id);

  return (
    <main className="mx-auto flex h-screen max-w-7xl flex-col px-6 py-6">
      <header className="mb-4 flex items-center justify-between gap-4">
        <div>
          <Link href={`/oportunidades/${context.opportunityId}`} className="text-sm text-cyan-400 hover:underline">
            ← {context.customerName}
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-slate-50">Conversación</h1>
        </div>
        <span className="rounded-full bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30">
          {CONVERSATION_STAGE_LABELS[context.stage] ?? context.stage}
        </span>
      </header>

      {order && closingStats && <OrderConfirmedCard order={order} stats={closingStats} />}

      <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-[280px_1fr_320px]">
        <Panel title="Contexto">
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wider text-slate-500">Cliente</dt>
              <dd className="mt-1 font-medium text-slate-100">{context.customerName}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-slate-500">Etapa comercial</dt>
              <dd className="mt-1 font-medium text-slate-100">
                {CONVERSATION_STAGE_LABELS[context.stage] ?? context.stage}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-slate-500">Próximo objetivo del agente</dt>
              <dd className="mt-1 text-slate-300">{context.objectiveCurrent ?? "Descubrir el motivo de inactividad."}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-slate-500">Motivo detectado</dt>
              <dd className="mt-1 text-slate-300">{context.reasonText ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-slate-500">Potencial estimado</dt>
              <dd className="mt-1 font-medium text-slate-100">
                {formatCurrency(context.potentialLow)} – {formatCurrency(context.potentialHigh)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-slate-500">Productos relevantes</dt>
              <dd className="mt-1 space-y-1 text-slate-300">
                {frequentProducts.length === 0
                  ? "—"
                  : frequentProducts.map((p) => <div key={p.productId}>{p.name}</div>)}
              </dd>
            </div>
          </dl>
        </Panel>

        <Panel title="Conversación (WhatsApp)" flush>
          <ConversationChat messages={messages} ended={!!context.endedAt} action={boundSendMessage} />
        </Panel>

        <div className="flex flex-col gap-4 overflow-hidden">
        {payment ? (
          <Panel title="Cobro y recordatorios de pago" className="shrink-0">
            <PaymentReminderPanel
              steps={payment.steps}
              sentCount={payment.sentCount}
              canSimulate={payment.canSimulate}
              blockedReason={payment.blockedReason}
              dueDateLabel={formatDateEs(payment.dueDate)}
              totalLabel={money(payment.total)}
              paymentHref={`/pagar/${payment.token}`}
              action={boundSimulatePaymentReminder}
            />
          </Panel>
        ) : (
          <Panel title="Seguimiento si el cliente no responde" className="shrink-0">
            <FollowUpPanel
              steps={FOLLOW_UP_STEPS}
              sentCount={followUp.sentCount}
              canSimulate={followUp.canSimulate}
              blockedReason={followUp.blockedReason}
              action={boundSimulateNoReply}
              agreed={followUp.agreed}
              agreedAction={boundSimulateAgreed}
            />
          </Panel>
        )}

        <Panel title="Actividad del agente" className="min-h-0 flex-1">
          {activity.length === 0 ? (
            <p className="text-sm text-slate-600">Sin actividad todavía.</p>
          ) : (
            <ul className="space-y-3">
              {activity.map((entry) => (
                <li key={entry.id} className="border-l-2 border-slate-700 pl-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    {AUDIT_CATEGORY_LABELS[entry.category] ?? entry.category}
                  </p>
                  <p className="text-sm text-slate-200">{entry.label}</p>
                  <p className="text-[10px] text-slate-600">{timeAgo(entry.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        </div>
      </div>
    </main>
  );
}
