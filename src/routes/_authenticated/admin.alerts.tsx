// Phase 3C-2 — Admin Smart Alert diagnostics.

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldAlert } from "lucide-react";
import { getAdminAlertDiagnostics } from "@/lib/smart-alerts/persistence.functions";

export const Route = createFileRoute("/_authenticated/admin/alerts")({
  component: AdminAlertsPage,
  head: () => ({ meta: [{ title: "Admin · Smart Alerts" }] }),
  errorComponent: ({ error, reset }) => (
    <div className="p-6 text-sm text-red-300">
      <p>Admin diagnostics unavailable: {(error as Error).message}</p>
      <button onClick={reset} className="mt-2 rounded border border-border/60 px-2 py-1">Retry</button>
    </div>
  ),
  notFoundComponent: () => <div className="p-6">Not found</div>,
});

function AdminAlertsPage() {
  const fn = useServerFn(getAdminAlertDiagnostics);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-alerts-diagnostics"],
    queryFn: () => fn(),
    staleTime: 30_000,
  });

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground">
          <ShieldAlert size={18} /> Smart Alerts · Admin diagnostics
        </h1>
        <p className="text-xs text-muted-foreground">Read-only aggregate view. No PII surfaced.</p>
      </header>

      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {error && <div className="text-sm text-red-300">Failed to load diagnostics.</div>}
      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="Total events" value={data.totalEvents} />
            <Metric label="Unread events" value={data.unreadEvents} />
            <Metric label="Last 24h" value={data.last24hCount} />
          </div>
          <footer className="rounded-md border border-border/60 bg-muted/30 p-3 text-[11px] text-muted-foreground">
            Rules version: <code>{data.rulesVersion}</code>
            <br />
            {data.disclaimer}
          </footer>
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background p-4">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-foreground">{value.toLocaleString()}</div>
    </div>
  );
}