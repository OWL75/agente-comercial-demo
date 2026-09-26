import { sql } from "@/lib/db";
import { workspaceVersion } from "@/lib/live/versions";
import { LiveProvider } from "@/components/live/live-provider";
import { Sidebar } from "@/components/shell/sidebar";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const [[counts], version] = await Promise.all([
    sql<Array<{ pending: number; active: number }>>`
      select
        (select count(*) from agente_comercial.approvals where status = 'pending')::int as pending,
        (select count(*) from agente_comercial.conversations where ended_at is null)::int as active
    `,
    workspaceVersion().catch(() => null),
  ]);

  return (
    <LiveProvider initialVersion={version}>
      <div className="app-backdrop min-h-screen lg:flex">
        <Sidebar pendingApprovals={counts?.pending ?? 0} activeConversations={counts?.active ?? 0} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </LiveProvider>
  );
}
