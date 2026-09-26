import { getActivePolicy } from "@/lib/db/policies";
import { Card, PageHeader } from "@/components/ui/primitives";
import { IconBox, IconCard, IconLock, IconPercent, IconTruck } from "@/components/ui/icons";

// No dynamic segments or searchParams here, so Next would otherwise prerender
// this page once at build time — freezing whatever the policy config was
// during `next build`. Policies are meant to be live, so force a server
// render on every request instead.
export const dynamic = "force-dynamic";

function Rule({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "auto" | "human" | "blocked" | "neutral" }) {
  const tones = {
    auto: "bg-emerald-400/10 text-emerald-300 ring-emerald-400/20",
    human: "bg-amber-400/10 text-amber-300 ring-amber-400/25",
    blocked: "bg-rose-400/10 text-rose-300 ring-rose-400/20",
    neutral: "bg-white/[0.05] text-slate-200 ring-white/[0.08]",
  };
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/[0.05] py-3 text-sm last:border-0">
      <dt className="text-slate-400">{label}</dt>
      <dd className={`chip ring-1 ring-inset ${tones[tone]}`}>{value}</dd>
    </div>
  );
}

export default async function PoliticasPage() {
  const policy = await getActivePolicy();

  return (
    <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8 lg:py-10">
      <PageHeader
        eyebrow={policy ? `Reglas del agente · versión ${policy.version}` : "Reglas del agente"}
        title="Políticas comerciales"
        description="Las reglas que Fernán consulta antes de negociar. No puede inventarlas ni modificarlas: solo leerlas y actuar dentro de sus límites. Todo lo que las excede pasa a una persona."
      />

      {!policy ? (
        <p className="text-sm text-slate-500">No hay una política activa configurada.</p>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          <Card title="Descuentos" icon={<IconPercent className="h-4 w-4" />} className="md:col-span-2">
            <div className="mb-5">
              <div className="flex h-3 overflow-hidden rounded-full ring-1 ring-inset ring-white/[0.06]">
                <span className="bg-gradient-to-r from-emerald-400 to-emerald-300" style={{ flex: policy.config.discount.autoMaxPct }} />
                <span
                  className="bg-gradient-to-r from-amber-400 to-amber-300"
                  style={{ flex: Math.max(1, policy.config.discount.approvalMaxPct - policy.config.discount.autoMaxPct) }}
                />
                <span className="bg-rose-400/50" style={{ flex: Math.max(2, Math.round(policy.config.discount.approvalMaxPct / 3)) }} />
              </div>
              <div className="relative mt-2 flex text-[11px] text-slate-500 tabular-nums">
                <span className="absolute left-0">0%</span>
                <span className="text-right" style={{ flex: policy.config.discount.autoMaxPct }}>
                  {policy.config.discount.autoMaxPct}%
                </span>
                <span
                  className="text-right"
                  style={{ flex: Math.max(1, policy.config.discount.approvalMaxPct - policy.config.discount.autoMaxPct) }}
                >
                  {policy.config.discount.approvalMaxPct}%
                </span>
                <span className="text-right" style={{ flex: Math.max(2, Math.round(policy.config.discount.approvalMaxPct / 3)) }}>
                  más
                </span>
              </div>
            </div>
            <dl>
              <Rule label="Autónomo (sin aprobación)" value={`0% – ${policy.config.discount.autoMaxPct}%`} tone="auto" />
              <Rule
                label="Requiere aprobación humana"
                value={`${policy.config.discount.autoMaxPct + 1}% – ${policy.config.discount.approvalMaxPct}%`}
                tone="human"
              />
              <Rule label="No autorizado" value={`> ${policy.config.discount.approvalMaxPct}%`} tone="blocked" />
            </dl>
          </Card>
          <Card title="Crédito" icon={<IconCard className="h-4 w-4" />}>
            <dl>
              <Rule
                label="Mantener condición existente"
                value={policy.config.credit.existingConditionAuto ? "Autónomo" : "Requiere aprobación"}
                tone={policy.config.credit.existingConditionAuto ? "auto" : "human"}
              />
              <Rule
                label="Nuevo crédito o aumento"
                value={policy.config.credit.increaseRequiresApproval ? "Requiere aprobación humana" : "Autónomo"}
                tone={policy.config.credit.increaseRequiresApproval ? "human" : "auto"}
              />
            </dl>
          </Card>
          <Card title="Entrega" icon={<IconTruck className="h-4 w-4" />}>
            <dl>
              <Rule label="Estándar" value={`${policy.config.delivery.standardHours} horas`} />
              <Rule
                label="Express"
                value={`${policy.config.delivery.expressHours} horas${policy.config.delivery.expressRequiresEligibleStock ? " (según disponibilidad)" : ""}`}
              />
              <Rule
                label="Extraordinaria"
                value={policy.config.delivery.extraordinaryRequiresApproval ? "Requiere aprobación humana" : "Autónomo"}
                tone={policy.config.delivery.extraordinaryRequiresApproval ? "human" : "auto"}
              />
            </dl>
          </Card>
          <Card title="Stock" icon={<IconBox className="h-4 w-4" />}>
            <dl>
              <Rule
                label="Confirmar venta sin verificar stock"
                value={policy.config.stock.neverConfirmWithoutCheck ? "Nunca permitido" : "Permitido"}
                tone={policy.config.stock.neverConfirmWithoutCheck ? "blocked" : "auto"}
              />
            </dl>
          </Card>
          <div className="surface flex items-start gap-3 p-5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-400/10 text-violet-300 ring-1 ring-inset ring-violet-400/20">
              <IconLock className="h-4 w-4" />
            </span>
            <p className="text-sm leading-relaxed text-slate-400">
              Cada precio, descuento y total que Fernán escribe se verifica contra estas reglas antes de enviarse. Si algo no
              cuadra, la respuesta se bloquea y se reescribe.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
