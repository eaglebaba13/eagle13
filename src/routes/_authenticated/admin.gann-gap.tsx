// Phase 2I-D — Gann Gap Outlook admin operations dashboard.
// Research-only. Never mutates trading formulas. Admin-guarded via
// requireSupabaseAuth + assertAdmin inside diagnostics server fn.

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  getGannGapDiagnostics,
  freezeGannGapPrediction,
  evaluatePendingGannGapOutcome,
  getGannGapPredictionHistory,
} from "@/lib/gann-gap/gann-gap.persistence.functions";
import { GANN_GAP_DISCLAIMER } from "@/lib/gann-gap/types";
import { downloadBlob } from "@/lib/download";

export const Route = createFileRoute("/_authenticated/admin/gann-gap")({
  head: () => ({
    meta: [
      { title: "Gann Gap Ops — Admin" },
      { name: "description", content: "Admin console for Gann Gap Outlook freeze, outcome and analytics." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AdminGannGapPage,
});

function AdminGannGapPage() {
  const fetchDiag = useServerFn(getGannGapDiagnostics);
  const doFreeze = useServerFn(freezeGannGapPrediction);
  const doEvaluate = useServerFn(evaluatePendingGannGapOutcome);
  const fetchHistory = useServerFn(getGannGapPredictionHistory);
  const [msg, setMsg] = useState<string | null>(null);

  const diag = useQuery({
    queryKey: ["admin", "gann-gap", "diagnostics"],
    queryFn: () => fetchDiag(),
    retry: false,
    staleTime: 15_000,
  });

  const history = useQuery({
    queryKey: ["admin", "gann-gap", "history"],
    queryFn: () => fetchHistory({ data: { limit: 50 } as any } as any).catch(() => []),
    retry: false,
    staleTime: 30_000,
  });

  const d = diag.data ?? null;

  const onFreeze = async () => {
    setMsg(null);
    try { await doFreeze(); await diag.refetch(); setMsg("Freeze completed"); }
    catch (e) { setMsg((e as Error).message); }
  };
  const onEval = async () => {
    setMsg(null);
    try { await doEvaluate(); await diag.refetch(); setMsg("Outcome evaluation attempted"); }
    catch (e) { setMsg((e as Error).message); }
  };

  const onExport = () => {
    if (!d) return;
    downloadBlob(new Blob([d.safeExport], { type: "application/json" }), `gann-gap-diagnostics-${new Date().toISOString().slice(0,10)}.json`);
  };

  return (
    <div className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Gann Gap Ops</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Admin console for freeze lifecycle, outcome pipeline, and analytics.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => diag.refetch()} className="rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-muted/40">Refresh</button>
            <button onClick={onFreeze} className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/20">Freeze now</button>
            <button onClick={onEval} className="rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-300 hover:bg-sky-500/20">Evaluate outcomes</button>
            <button onClick={onExport} disabled={!d} className="rounded-md border border-border bg-card px-3 py-1.5 text-xs disabled:opacity-50 hover:bg-muted/40">Export diagnostics</button>
          </div>
        </header>

        {msg && <div className="rounded-md border border-border bg-muted/20 p-2 text-xs text-muted-foreground">{msg}</div>}
        {diag.error && <div role="alert" className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{(diag.error as Error).message}</div>}
        {diag.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

        {d && (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile label="Predictions" value={d.predictionCount} />
              <StatTile label="Outcomes" value={d.outcomeCount} />
              <StatTile label="Evaluated" value={d.historical.metrics.evaluated} />
              <StatTile label="Pending" value={d.historical.metrics.pending} />
            </section>

            <section className="grid gap-3 lg:grid-cols-2">
              <Card title="Latest prediction">
                {d.latestPrediction ? (
                  <dl className="grid gap-1 text-xs">
                    <Row k="Trading date" v={d.latestPrediction.tradingDate} />
                    <Row k="For session" v={d.latestPrediction.nextTradingDate ?? "—"} />
                    <Row k="Label" v={d.latestPrediction.label} />
                    <Row k="Reference" v={d.latestPrediction.reference?.toFixed(2) ?? "—"} />
                    <Row k="Confidence" v={d.latestPrediction.confidenceBand ?? "—"} />
                    <Row k="Frozen at" v={d.latestPrediction.frozenAt ?? "—"} />
                    <Row k="Source" v={d.latestPrediction.source ?? "—"} />
                  </dl>
                ) : <p className="text-xs text-muted-foreground">No frozen prediction yet.</p>}
              </Card>
              <Card title="Latest outcome">
                {d.latestOutcome ? (
                  <dl className="grid gap-1 text-xs">
                    <Row k="For prediction" v={d.latestOutcome.predictionId} />
                    <Row k="Outcome" v={d.latestOutcome.outcome} />
                    <Row k="Gap (pts)" v={d.latestOutcome.gapPoints?.toFixed(2) ?? "—"} />
                    <Row k="Gap %" v={d.latestOutcome.gapPercent != null ? (d.latestOutcome.gapPercent * 100).toFixed(3) + "%" : "—"} />
                    <Row k="Evaluated at" v={d.latestOutcome.evaluatedAt ?? "—"} />
                    <Row k="Rule" v={d.latestOutcome.ruleVersion} />
                  </dl>
                ) : <p className="text-xs text-muted-foreground">No outcome evaluated yet.</p>}
              </Card>
            </section>

            <Card title="Historical validation">
              <div className="grid gap-2 text-xs sm:grid-cols-3">
                <Row k="Total" v={d.historical.metrics.total} />
                <Row k="Correct" v={d.historical.metrics.correct} />
                <Row k="Incorrect" v={d.historical.metrics.incorrect} />
                <Row k="Win rate" v={d.historical.metrics.winRatePct != null ? d.historical.metrics.winRatePct.toFixed(1) + "%" : "—"} />
                <Row k="Meets min sample" v={String(d.historical.metrics.meetsMinSample)} />
                <Row k="Leakage detected" v={d.historical.metrics.leakageDetected} />
              </div>
              {!d.historical.metrics.meetsMinSample && (
                <p className="mt-2 text-[11px] text-amber-300">
                  Sample size below research threshold — figures are preliminary.
                </p>
              )}
            </Card>

            <Card title="Scheduler">
              <dl className="grid gap-1 text-xs sm:grid-cols-2">
                <Row k="Production schedule" v={d.scheduler.productionSchedule} />
                <Row k="Enabled" v={String(d.scheduler.enabled)} />
                <Row k="Last run" v={d.scheduler.lastRunAt ?? "—"} />
                <Row k="Last kind" v={d.scheduler.lastRunKind ?? "—"} />
                <Row k="Last error" v={d.scheduler.lastError ?? "—"} />
                <Row k="Updated" v={d.scheduler.updatedAt ?? "—"} />
              </dl>
            </Card>

            <Card title="Versions">
              <dl className="grid gap-1 text-xs sm:grid-cols-3">
                <Row k="Formula" v={d.formulaVersion} />
                <Row k="Config" v={d.configVersion} />
                <Row k="Outcome rule" v={d.outcomeRuleVersion} />
              </dl>
            </Card>

            <Card title="Recent predictions">
              {history.isLoading && <p className="text-xs text-muted-foreground">Loading history…</p>}
              {Array.isArray(history.data) && history.data.length === 0 && (
                <p className="text-xs text-muted-foreground">No historical predictions yet.</p>
              )}
              {Array.isArray(history.data) && history.data.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-xs">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th className="px-2 py-1">Trading date</th>
                        <th className="px-2 py-1">Next</th>
                        <th className="px-2 py-1">Label</th>
                        <th className="px-2 py-1">Reference</th>
                        <th className="px-2 py-1">Confidence</th>
                        <th className="px-2 py-1">Frozen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.data.slice(0, 30).map((h: any) => (
                        <tr key={h.predictionId} className="border-t border-border/40">
                          <td className="px-2 py-1">{h.tradingDate}</td>
                          <td className="px-2 py-1">{h.nextTradingDate ?? "—"}</td>
                          <td className="px-2 py-1 font-medium text-foreground">{h.label}</td>
                          <td className="px-2 py-1">{h.reference?.toFixed?.(2) ?? "—"}</td>
                          <td className="px-2 py-1">{h.confidenceBand ?? "—"}</td>
                          <td className="px-2 py-1">{h.frozenAt ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <p className="text-[11px] text-muted-foreground/80">{GANN_GAP_DISCLAIMER}</p>
          </>
        )}
      </div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
    </div>
  );
}
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card/60 p-4">
      <h2 className="mb-2 text-sm font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}
function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="inline text-muted-foreground">{k}: </dt>
      <dd className="inline font-medium text-foreground break-all">{v}</dd>
    </div>
  );
}
