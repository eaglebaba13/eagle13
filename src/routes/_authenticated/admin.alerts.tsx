// Phase 3C-2 — Admin Smart Alert diagnostics.

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldAlert, RefreshCw } from "lucide-react";
import { getAdminAlertDiagnostics, runSmartAlerts } from "@/lib/smart-alerts/persistence.functions";

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
  const qc = useQueryClient();
  const fn = useServerFn(getAdminAlertDiagnostics);
  const runFn = useServerFn(runSmartAlerts);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-alerts-diagnostics"],
    queryFn: () => fn(),
    staleTime: 30_000,
  });
  const run = useMutation({
    mutationFn: () => runFn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-alerts-diagnostics"] }),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground">
            <ShieldAlert size={18} /> Smart Alerts · Admin diagnostics
          </h1>
          <p className="text-xs text-muted-foreground">Read-only aggregate view. No PII surfaced.</p>
        </div>
        <button
          onClick={() => run.mutate()}
          disabled={run.isPending}
          className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background px-3 py-1.5 text-xs hover:bg-muted/40 disabled:opacity-50"
        >
          <RefreshCw size={13} className={run.isPending ? "animate-spin" : ""} /> Run evaluation (own scope)
        </button>
      </header>

      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {error && <div className="text-sm text-red-300">Failed to load diagnostics.</div>}
      {data && (
        <>
          <section className={`rounded-lg border p-3 text-sm ${data.engineStatus === "HEALTHY" ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-200" : data.engineStatus === "DEGRADED" ? "border-amber-500/40 bg-amber-500/5 text-amber-200" : "border-red-500/40 bg-red-500/5 text-red-200"}`}>
            <div className="flex items-center justify-between">
              <div className="font-medium">Engine status · {data.engineStatus}</div>
              <div className="text-[11px] opacity-80">Rules v{data.rulesVersion}</div>
            </div>
            <p className="mt-1 text-xs">{data.engineReason}</p>
            {data.engineWarnings.length > 0 && (
              <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[11px]">
                {data.engineWarnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
            {data.engineBlockers.length > 0 && (
              <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[11px]">
                {data.engineBlockers.map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            )}
          </section>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Metric label="Total events" value={data.totalEvents} />
            <Metric label="Unread events" value={data.unreadEvents} />
            <Metric label="Last 24h" value={data.last24hCount} />
            <Metric label="Active subscriptions" value={data.activeSubscriptions} />
            <Metric label="Checkpoints" value={data.checkpointCount} />
            <Metric label="Delivery attempts" value={data.deliveryAttempts} />
            <Metric label="Delivery failures" value={data.deliveryFailures} />
            <Metric label="Rules loaded" value={data.ruleCount} />
          </div>

          <section className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border/60 bg-background p-3 text-xs">
              <div className="text-[11px] uppercase text-muted-foreground">Last evaluation</div>
              <div className="mt-1 text-foreground">{data.lastEvaluationAt ? new Date(data.lastEvaluationAt).toLocaleString() : "—"}</div>
              <div className="mt-1 text-muted-foreground">Status: {data.lastEvaluationStatus}</div>
              <div className="mt-1 text-muted-foreground">Last success: {data.lastSuccessfulEvaluationAt ? new Date(data.lastSuccessfulEvaluationAt).toLocaleString() : "—"}</div>
            </div>
            <div className="rounded-lg border border-border/60 bg-background p-3 text-xs">
              <div className="text-[11px] uppercase text-muted-foreground">External adapters</div>
              <div className="mt-1 text-foreground">
                {data.externalAdaptersDisabledByConfiguration ? "Disabled by configuration (v1.0)" : "Enabled"}
              </div>
              <div className="mt-2 text-[11px] uppercase text-muted-foreground">Latest safe errors</div>
              {data.latestErrors.length === 0 ? (
                <div className="mt-1 text-muted-foreground">None</div>
              ) : (
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-muted-foreground">
                  {data.latestErrors.map((e, i) => <li key={i} className="truncate">{e}</li>)}
                </ul>
              )}
            </div>
          </section>

          {run.data && (
            <div className="rounded-md border border-border/60 bg-muted/30 p-2 text-[11px] text-muted-foreground">
              Last run: emitted {run.data.emittedCount}, suppressed {run.data.suppressedCount}
              {run.data.persistenceFailed && <span className="text-red-300"> · persistence failed</span>}
            </div>
          )}

          <footer className="rounded-md border border-border/60 bg-muted/30 p-3 text-[11px] text-muted-foreground">
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