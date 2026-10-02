import { listConversations } from "@/lib/db/conversations";
import { ConversationList } from "@/components/conversation-list";
import { Card, PageHeader } from "@/components/ui/primitives";
import { IconChat } from "@/components/ui/icons";

export const dynamic = "force-dynamic";

export default async function ConversacionesPage() {
  const [conversations, prospects] = await Promise.all([listConversations(100), listConversations(50, { prospects: true })]);
  const active = conversations.filter((c) => !c.endedAt);
  const ended = conversations.filter((c) => c.endedAt);

  return (
    <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8 lg:py-10">
      <PageHeader
        eyebrow="WhatsApp · en vivo"
        title="Conversaciones"
        description="Todo lo que Fernán conversa con los clientes, actualizado al instante: cada mensaje nuevo aparece aquí sin recargar la página."
      />

      <div className="space-y-6">
        <Card
          title="Activas"
          icon={<IconChat className="h-4 w-4" />}
          action={<span className="text-xs text-slate-500 tabular-nums">{active.length}</span>}
          bodyClassName=""
          className="overflow-hidden"
        >
          <ConversationList items={active} emptyTitle="No hay conversaciones activas en este momento" />
        </Card>

        {prospects.length > 0 && (
          <Card
            title="Prospectos que probaron a Fernán"
            action={<span className="text-xs text-slate-500 tabular-nums">{prospects.length}</span>}
            bodyClassName=""
            className="overflow-hidden"
          >
            <p className="border-b border-white/[0.05] px-5 py-3 text-xs text-slate-500">
              Escribieron DEMO al WhatsApp del agente y Fernán les vendió a ellos. Cada número es un posible cliente.
            </p>
            <ConversationList items={prospects} />
          </Card>
        )}

        {ended.length > 0 && (
          <Card
            title="Finalizadas"
            action={<span className="text-xs text-slate-500 tabular-nums">{ended.length}</span>}
            bodyClassName=""
            className="overflow-hidden"
          >
            <ConversationList items={ended} />
          </Card>
        )}
      </div>
    </main>
  );
}
