import Link from "next/link";
import { getActivePolicy } from "@/lib/db/policies";

// No dynamic segments or searchParams here, so Next would otherwise prerender
// this page once at build time — freezing whatever the policy config was
// during `next build`. Policies are meant to be live, so force a server
// render on every request instead.
export const dynamic = "force-dynamic";

function PolicyCard({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
      <h2 className="mb-3 text-sm font-semibold text-slate-100">{title}</h2>
      <dl className="space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4 text-sm">
            <dt className="text-slate-500">{row.label}</dt>
            <dd className="font-medium text-slate-200">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default async function PoliticasPage() {
  const policy = await getActivePolicy();

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link href="/oportunidades" className="text-sm text-cyan-400 hover:underline">
        ← Centro de Oportunidades
      </Link>
      <header className="mt-4 mb-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-cyan-400">
          SISTECOMP · Nova Distribution
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-50">Políticas comerciales</h1>
        <p className="mt-2 text-sm text-slate-500">
          Estas son las reglas que el agente consulta antes de negociar. No puede inventarlas ni
          modificarlas: solo puede leerlas y actuar dentro de sus límites.
          {policy && <span className="ml-1 text-slate-600">(versión {policy.version})</span>}
        </p>
      </header>

      {!policy ? (
        <p className="text-sm text-slate-500">No hay una política activa configurada.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <PolicyCard
            title="Descuentos"
            rows={[
              { label: "Autónomo (sin aprobación)", value: `0% – ${policy.config.discount.autoMaxPct}%` },
              {
                label: "Requiere aprobación humana",
                value: `${policy.config.discount.autoMaxPct + 1}% – ${policy.config.discount.approvalMaxPct}%`,
              },
              { label: "No autorizado", value: `> ${policy.config.discount.approvalMaxPct}%` },
            ]}
          />
          <PolicyCard
            title="Crédito"
            rows={[
              {
                label: "Mantener condición existente",
                value: policy.config.credit.existingConditionAuto ? "Autónomo" : "Requiere aprobación",
              },
              {
                label: "Nuevo crédito o aumento",
                value: policy.config.credit.increaseRequiresApproval
                  ? "Requiere aprobación humana"
                  : "Autónomo",
              },
            ]}
          />
          <PolicyCard
            title="Entrega"
            rows={[
              { label: "Estándar", value: `${policy.config.delivery.standardHours} horas` },
              {
                label: "Express",
                value: `${policy.config.delivery.expressHours} horas${policy.config.delivery.expressRequiresEligibleStock ? " (según disponibilidad)" : ""}`,
              },
              {
                label: "Extraordinaria",
                value: policy.config.delivery.extraordinaryRequiresApproval
                  ? "Requiere aprobación humana"
                  : "Autónomo",
              },
            ]}
          />
          <PolicyCard
            title="Stock"
            rows={[
              {
                label: "Confirmar venta sin verificar stock",
                value: policy.config.stock.neverConfirmWithoutCheck ? "Nunca permitido" : "Permitido",
              },
            ]}
          />
        </div>
      )}
    </main>
  );
}
