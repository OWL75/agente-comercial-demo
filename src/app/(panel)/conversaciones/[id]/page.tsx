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
import { CONVERSATION_STAGE_LABELS, CONVERSATION_STAGE_STYLES } from "@/lib/labels";
import { ConversationChat } from "@/components/conversation-chat";
import { OrderConfirmedCard } from "@/components/order-confirmed-card";
import { FollowUpPanel } from "@/components/follow-up-panel";
import { PaymentReminderPanel } from "@/components/payment-reminder-panel";
import { StageStepper } from "@/components/stage-stepper";
import { ActivityTimeline } from "@/components/activity-timeline";
import { LiveIndicator } from "@/components/live/live-provider";
import { Avatar, Pill } from "@/components/ui/primitives";
import { IconArrowLeft, IconBox, IconClock, IconCpu, IconSpark, IconTarget, IconTrendUp } from "@/components/ui/icons";
import { getFollowUpState } from "@/lib/agent/follow-up";
import { FOLLOW_UP_STEPS } from "@/lib/agent/follow-up-sequence";
import { getPaymentReminderState } from "@/lib/payments/payments";
import { formatDateEs, money } from "@/lib/payments/payment-messages";
import { sendMessageAction, simulateAgreedFollowUpAction, simulateNoReplyAction, simulatePaymentReminderAction } from "./actions";

export const dynamic = "force-dynamic";

function Panel({
  title,
  icon,
  children,
  className = "",
  flush = false,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** The chat manages its own scroll region and input bar. */
  flush?: boolean;
}) {
  return (
    <section className={`surface flex flex-col overflow-hidden ${className}`}>
      <h2 className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3 text-[13px] font-semibold text-slate-200">
        {icon && <span className="text-slate-500">{icon}</span>}
        {title}
      </h2>
      {flush ? <div className="min-h-0 flex-1 overflow-hidden">{children}</div> : <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>}
    </section>
  );
}

function Fact({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/[0.04] text-slate-400 ring-1 ring-inset ring-white/[0.06]">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="eyebrow !text-[10px]">{label}</p>
        <div className="mt-1 text-sm text-slate-200">{children}</div>
      </div>
    </div>
  );
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
    <main className="mx-auto flex max-w-[1500px] flex-col px-4 py-5 sm:px-6 xl:h-screen">
      <header className="surface mb-4 flex flex-wrap items-center justify-between gap-4 px-4 py-3.5 animate-fade-up">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/conversaciones"
            aria-label="Volver a conversaciones"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-slate-400 ring-1 ring-inset ring-white/[0.08] transition hover:bg-white/[0.05] hover:text-white"
          >
            <IconArrowLeft className="h-4 w-4" />
          </Link>
          <Avatar name={context.customerName} />
          <div className="min-w-0">
            <Link
              href={`/oportunidades/${context.opportunityId}`}
              className="block truncate text-base font-semibold text-white hover:text-teal-200"
            >
              {context.customerName}
            </Link>
            <p className="text-xs text-slate-500">WhatsApp · atendido por Fernán</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <StageStepper stage={context.stage} />
          <span className="hidden h-6 w-px bg-white/[0.08] xl:block" />
          <span className="hidden lg:inline-flex">
            <LiveIndicator />
          </span>
        </div>
      </header>

      {order && closingStats && <OrderConfirmedCard order={order} stats={closingStats} />}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[290px_minmax(0,1fr)] xl:grid-cols-[290px_minmax(0,1fr)_340px]">
        <Panel title="Contexto del cliente" icon={<IconTarget className="h-4 w-4" />} className="order-2 lg:order-none">
          <div className="space-y-5">
            <div className="surface-ai p-3.5">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-violet-300">
                <IconSpark className="h-3.5 w-3.5" /> Próximo objetivo
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-200">
                {context.objectiveCurrent ?? "Descubrir el motivo de inactividad."}
              </p>
            </div>
            <Fact icon={<IconCpu className="h-3.5 w-3.5" />} label="Etapa comercial">
              <Pill className={CONVERSATION_STAGE_STYLES[context.stage] ?? "text-slate-300"}>
                {CONVERSATION_STAGE_LABELS[context.stage] ?? context.stage}
              </Pill>
            </Fact>
            <Fact icon={<IconClock className="h-3.5 w-3.5" />} label="Motivo detectado">
              <p className="leading-relaxed text-slate-300">{context.reasonText ?? "—"}</p>
            </Fact>
            <Fact icon={<IconTrendUp className="h-3.5 w-3.5" />} label="Potencial estimado">
              <p className="font-semibold text-white tabular-nums">
                {formatCurrency(context.potentialLow)} – {formatCurrency(context.potentialHigh)}
              </p>
            </Fact>
            <Fact icon={<IconBox className="h-3.5 w-3.5" />} label="Productos relevantes">
              {frequentProducts.length === 0 ? (
                "—"
              ) : (
                <ul className="space-y-1">
                  {frequentProducts.map((p) => (
                    <li key={p.productId} className="text-slate-300">
                      {p.name}
                    </li>
                  ))}
                </ul>
              )}
            </Fact>
          </div>
        </Panel>

        <Panel title="Conversación por WhatsApp" flush className="order-1 h-[72vh] lg:order-none xl:h-auto">
          <ConversationChat messages={messages} ended={!!context.endedAt} action={boundSendMessage} />
        </Panel>

        <div className="order-3 flex min-h-0 flex-col gap-4 lg:col-span-2 xl:col-span-1 xl:overflow-y-auto">
          {payment ? (
            <Panel title="Cobro y recordatorios" className="shrink-0">
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
            <Panel title="Seguimiento si no responde" className="shrink-0">
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

          <Panel title="Actividad del agente" icon={<IconCpu className="h-4 w-4" />} className="max-h-[70vh] min-h-[360px] flex-1 xl:max-h-none">
            <ActivityTimeline entries={activity} />
          </Panel>
        </div>
      </div>
    </main>
  );
}
