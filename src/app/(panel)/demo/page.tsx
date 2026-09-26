import { PrepareDemoButton } from "@/components/prepare-demo-button";
import { DEMO_CUSTOMER_NAME, getDemoScenarioStatus } from "@/lib/demo-scenario";
import { Card, PageHeader } from "@/components/ui/primitives";
import { IconAlert, IconCheck, IconCpu, IconPlay } from "@/components/ui/icons";
import { prepareDemoAction } from "./actions";

export const dynamic = "force-dynamic";

function StatusRow({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <li className="flex items-start gap-3 border-b border-white/[0.05] py-3.5 last:border-0">
      <span
        className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ring-1 ring-inset ${
          ok ? "bg-emerald-400/10 text-emerald-300 ring-emerald-400/25" : "bg-amber-400/10 text-amber-300 ring-amber-400/30"
        }`}
      >
        {ok ? <IconCheck className="h-3.5 w-3.5" /> : <IconAlert className="h-3.5 w-3.5" />}
      </span>
      <div>
        <p className="text-sm font-medium text-slate-100">{label}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{detail}</p>
      </div>
    </li>
  );
}

export default async function DemoPage() {
  const status = await getDemoScenarioStatus();
  const steps = [
    "Desde el teléfono demo, envíe cualquier mensaje al número del agente.",
    `Pulse el botón de abajo para limpiar y reconstruir ${DEMO_CUSTOMER_NAME}.`,
    "En la ficha que se abrirá, pulse «Iniciar conversación».",
    "Proyecte esta vista y responda al agente desde WhatsApp: los mensajes aparecen al instante.",
  ];

  return (
    <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8 lg:py-10">
      <PageHeader
        eyebrow="Control para reuniones y video"
        title="Preparar demostración"
        description="Restaura una sola empresa ficticia y deja intactos todos los demás clientes. El número demo debe haber escrito al WhatsApp del agente durante las 24 horas previas."
      />

      <div className="grid gap-5 md:grid-cols-2">
        <Card title="Estado técnico" icon={<IconCpu className="h-4 w-4" />}>
          <ul>
            <StatusRow
              ok={status.recipientConfigured}
              label="Teléfono de demostración"
              detail={
                status.recipientConfigured
                  ? `Configurado y termina en ${status.recipientPreview}`
                  : (status.recipientError ?? "Falta DEMO_WHATSAPP_RECIPIENT en EasyPanel.")
              }
            />
            <StatusRow
              ok={status.whatsappSendConfigured}
              label="Envío por WhatsApp"
              detail={status.whatsappSendConfigured ? "Token y Phone Number ID presentes." : "Faltan credenciales de envío de Meta."}
            />
            <StatusRow
              ok={status.webhookConfigured}
              label="Respuestas entrantes"
              detail={status.webhookConfigured ? "Webhook listo para validar firma y recibir mensajes." : "Faltan Verify Token o App Secret."}
            />
            <StatusRow
              ok={status.scenarioReady}
              label={DEMO_CUSTOMER_NAME}
              detail={status.scenarioReady ? "Lista para una nueva conversación." : "Todavía no se creó o necesita reiniciarse."}
            />
          </ul>
        </Card>

        <Card title="Antes de presentar" icon={<IconPlay className="h-4 w-4" />}>
          <ol className="space-y-3.5">
            {steps.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed text-slate-300">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-teal-400/10 text-xs font-semibold text-teal-300 ring-1 ring-inset ring-teal-400/25">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>

          <div className="mt-6">
            {status.recipientConfigured ? (
              <PrepareDemoButton action={prepareDemoAction} ready={status.scenarioReady} customerName={DEMO_CUSTOMER_NAME} />
            ) : (
              <button type="button" disabled className="btn btn-secondary !cursor-not-allowed">
                Configure el teléfono demo
              </button>
            )}
          </div>
          <p className="mt-4 text-xs leading-relaxed text-slate-500">
            En producción, el primer contacto fuera de la ventana de 24 horas se enviará con una plantilla aprobada por Meta.
            Esta demostración reutiliza una ventana abierta para acelerar la presentación.
          </p>
        </Card>
      </div>
    </main>
  );
}
