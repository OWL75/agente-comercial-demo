import Link from "next/link";
import { PrepareDemoButton } from "@/components/prepare-demo-button";
import { getDemoScenarioStatus } from "@/lib/demo-scenario";
import { prepareDemoAction } from "./actions";

export const dynamic = "force-dynamic";

function StatusRow({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <li className="flex items-start gap-3 border-b border-slate-800 py-3 last:border-0">
      <span className={ok ? "text-emerald-400" : "text-amber-400"}>{ok ? "✓" : "!"}</span>
      <div>
        <p className="text-sm font-medium text-slate-100">{label}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{detail}</p>
      </div>
    </li>
  );
}

export default async function DemoPage() {
  const status = await getDemoScenarioStatus();

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link href="/oportunidades" className="text-sm text-cyan-400 hover:underline">
        ← Centro de Oportunidades
      </Link>

      <header className="mt-4 mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-cyan-400">
          CONTROL PARA REUNIONES Y VIDEO
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-50">Preparar demostración</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
          Restaura una sola empresa ficticia y deja intactos todos los demás clientes. El número demo debe
          haber escrito al WhatsApp del agente durante las 24 horas previas.
        </p>
      </header>

      <div className="grid gap-5 md:grid-cols-2">
        <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <h2 className="text-sm font-semibold text-slate-100">Estado técnico</h2>
          <ul className="mt-2">
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
              label="Empresa Demo"
              detail={status.scenarioReady ? "Lista para una nueva conversación." : "Todavía no se creó o necesita reiniciarse."}
            />
          </ul>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <h2 className="text-sm font-semibold text-slate-100">Antes de presentar</h2>
          <ol className="mt-3 space-y-3 text-sm leading-relaxed text-slate-300">
            <li><span className="mr-2 text-cyan-400">1.</span>Desde el teléfono demo, envía cualquier mensaje al número del agente.</li>
            <li><span className="mr-2 text-cyan-400">2.</span>Pulsa el botón de abajo para limpiar y reconstruir Empresa Demo.</li>
            <li><span className="mr-2 text-cyan-400">3.</span>En la ficha que se abrirá, pulsa “Iniciar conversación”.</li>
            <li><span className="mr-2 text-cyan-400">4.</span>Proyecta la vista web y responde al agente desde WhatsApp.</li>
          </ol>

          <div className="mt-6">
            {status.recipientConfigured ? (
              <PrepareDemoButton action={prepareDemoAction} ready={status.scenarioReady} />
            ) : (
              <button
                type="button"
                disabled
                className="rounded-lg bg-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-400"
              >
                Configura el teléfono demo
              </button>
            )}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            En producción, el primer contacto fuera de la ventana de 24 horas se enviará con una plantilla
            aprobada por Meta. Esta demostración reutiliza una ventana abierta para acelerar la presentación.
          </p>
        </section>
      </div>
    </main>
  );
}
