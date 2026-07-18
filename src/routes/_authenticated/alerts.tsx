// Phase 3C-2 — Alert Center. Research-only. No trade execution wording.

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BellRing, CheckCheck, X, RefreshCw } from "lucide-react";
import {
  getSmartAlertEvents,
  getSmartAlertSubscription,
  updateSmartAlertSubscription,
  markSmartAlertRead,
  markSmartAlertDismissed,
  markAllSmartAlertsRead,
  runSmartAlerts,
  type PersistedAlertEventRow,
} from "@/lib/smart-alerts/persistence.functions";
import { allAlertTypes } from "@/lib/smart-alerts/subscriptions";
import { ALERT_DISCLAIMER, type AlertPriority, type AlertType } from "@/lib/smart-alerts/types";

export const Route = createFileRoute("/_authenticated/alerts")({
  component: AlertCenterPage,
  head: () => ({
    meta: [
      { title: "Alert Center · Research Signals" },
      { name: "description", content: "Deterministic canonical-signal alerts. Research only — no trade execution." },
    ],
  }),
  errorComponent: ({ error, reset }) => (
    <div className="p-6 text-sm text-red-300">
      <p>Alert Center unavailable: {(error as Error).message}</p>
      <button onClick={reset} className="mt-2 rounded border border-border/60 px-2 py-1">Retry</button>
    </div>
  ),
  notFoundComponent: () => <div className="p-6">Not found</div>,
});

const PRIORITY_TONE: Record<AlertPriority, string> = {
  CRITICAL: "bg-red-500/20 text-red-300 border-red-500/40",
  HIGH: "bg-red-500/15 text-red-300 border-red-500/40",
  MEDIUM: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  LOW: "bg-sky-500/15 text-sky-300 border-sky-500/40",
  INFO: "bg-muted text-muted-foreground border-border/60",
};

function AlertCenterPage() {
  const qc = useQueryClient();
  const evFn = useServerFn(getSmartAlertEvents);
  const subFn = useServerFn(getSmartAlertSubscription);
  const runFn = useServerFn(runSmartAlerts);
  const updSub = useServerFn(updateSmartAlertSubscription);
  const readFn = useServerFn(markSmartAlertRead);
  const dismissFn = useServerFn(markSmartAlertDismissed);
  const readAllFn = useServerFn(markAllSmartAlertsRead);

  const events = useQuery({
    queryKey: ["smart-alerts", "events"],
    queryFn: () => evFn({ data: { limit: 100 } }),
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
  const subscription = useQuery({
    queryKey: ["smart-alerts", "subscription"],
    queryFn: () => subFn(),
    staleTime: 60_000,
  });
  const run = useMutation({
    mutationFn: () => runFn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["smart-alerts"] }),
  });
  const toggleType = useMutation({
    mutationFn: (v: { t: AlertType; on: boolean }) => updSub({ data: { types: { [v.t]: v.on } } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["smart-alerts", "subscription"] }),
  });
  const readMut = useMutation({
    mutationFn: (id: string) => readFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["smart-alerts"] }),
  });
  const dismissMut = useMutation({
    mutationFn: (id: string) => dismissFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["smart-alerts"] }),
  });
  const readAllMut = useMutation({
    mutationFn: () => readAllFn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["smart-alerts"] }),
  });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground">
            <BellRing size={18} /> Alert Center
          </h1>
          <p className="text-xs text-muted-foreground">{ALERT_DISCLAIMER}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => run.mutate()}
            disabled={run.isPending}
            className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background px-3 py-1.5 text-xs hover:bg-muted/40 disabled:opacity-50"
          >
            <RefreshCw size={13} className={run.isPending ? "animate-spin" : ""} /> Evaluate now
          </button>
          <button
            onClick={() => readAllMut.mutate()}
            className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background px-3 py-1.5 text-xs hover:bg-muted/40"
          >
            <CheckCheck size={13} /> Mark all read
          </button>
        </div>
      </header>

      {run.data && (
        <div className="rounded-md border border-border/60 bg-muted/30 p-2 text-[11px] text-muted-foreground">
          Last run: emitted {run.data.emittedCount}, suppressed {run.data.suppressedCount}
          {" · "}rules v{run.data.diagnostics.rulesVersion}
          {" · "}runtime {run.data.runtimeOverall}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0 space-y-2">
          {events.isLoading && <div className="text-sm text-muted-foreground">Loading alerts…</div>}
          {events.error && <div className="text-sm text-red-300">Failed to load alerts.</div>}
          {events.data && events.data.length === 0 && (
            <div className="rounded-md border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
              No alerts yet. Press <em>Evaluate now</em> to check current canonical state.
            </div>
          )}
          {(events.data ?? []).map((e) => (
            <AlertRow
              key={e.id}
              row={e}
              onRead={() => readMut.mutate(e.id)}
              onDismiss={() => dismissMut.mutate(e.id)}
            />
          ))}
        </section>

        <aside className="space-y-2 rounded-lg border border-border/60 p-3">
          <h2 className="text-sm font-semibold">Alert types</h2>
          <p className="text-[11px] text-muted-foreground">Toggle categories you want to receive.</p>
          <div className="max-h-[65vh] space-y-1 overflow-y-auto pr-1 text-xs">
            {allAlertTypes().map((t) => {
              const on = subscription.data?.types[t] ?? true;
              return (
                <label key={t} className="flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1 hover:bg-muted/40">
                  <span className="truncate">{t.replace(/_/g, " ")}</span>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(ev) => toggleType.mutate({ t, on: ev.target.checked })}
                    className="h-4 w-4"
                  />
                </label>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}

function AlertRow({
  row,
  onRead,
  onDismiss,
}: {
  row: PersistedAlertEventRow;
  onRead: () => void;
  onDismiss: () => void;
}) {
  const unread = !row.readAt && !row.dismissedAt;
  return (
    <article
      className={`rounded-lg border p-3 transition-colors ${
        row.dismissedAt ? "border-border/40 opacity-60" : unread ? "border-primary/40 bg-primary/5" : "border-border/60"
      }`}
      onMouseEnter={() => { if (unread) onRead(); }}
    >
      <header className="flex items-start gap-2">
        <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium ${PRIORITY_TONE[row.priority]}`}>
          {row.priority}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-foreground">{row.title}</div>
          <div className="text-[11px] text-muted-foreground">
            {new Date(row.generatedAt).toLocaleString()} · {row.type.replace(/_/g, " ")}
          </div>
        </div>
        <button
          type="button"
          aria-label="Dismiss alert"
          onClick={onDismiss}
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
        >
          <X size={14} />
        </button>
      </header>
      <p className="mt-1 text-sm text-foreground/90">{row.summary}</p>
      {row.sourceModules.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
          {row.sourceModules.map((m) => (
            <span key={m} className="rounded border border-border/50 px-1.5 py-0.5">{m}</span>
          ))}
        </div>
      )}
    </article>
  );
}