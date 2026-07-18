// Phase 3G — Backtest Lab route.
// Research-only. Consumer of canonical historical datasets.

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BACKTEST_LAB_DISCLAIMER } from "@/lib/backtest-lab";
import {
  getBacktestLabDiagnostics,
  listBacktestRuns,
  listStrategiesFn,
} from "@/lib/backtest-lab/backtest-lab.functions";

export const Route = createFileRoute("/_authenticated/backtest-lab")({
  head: () => ({
    meta: [
      { title: "Backtest Lab — Strategy Research · EagleBABA" },
      { name: "description", content: "Deterministic strategy backtesting lab. Research only — historical results do not guarantee future performance." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BacktestLabPage,
});

function BacktestLabPage() {
  const fetchStrategies = useServerFn(listStrategiesFn);
  const fetchRuns = useServerFn(listBacktestRuns);
  const fetchDiag = useServerFn(getBacktestLabDiagnostics);

  const strategies = useQuery({ queryKey: ["backtest-lab", "strategies"], queryFn: () => fetchStrategies() });
  const runs = useQuery({ queryKey: ["backtest-lab", "runs"], queryFn: () => fetchRuns() });
  const diag = useQuery({ queryKey: ["backtest-lab", "diagnostics"], queryFn: () => fetchDiag() });

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <header>
        <div className="text-xs uppercase tracking-wide text-muted-foreground">BACKTEST LAB · STRATEGY RESEARCH</div>
        <h1 className="text-xl font-semibold text-foreground">Professional Backtesting &amp; Strategy Lab</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Deterministic. Consumer of canonical signals. No formulas modified. No live orders.
        </p>
      </header>

      <div role="note" className="rounded-md border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
        {BACKTEST_LAB_DISCLAIMER}
      </div>

      <section className="grid gap-3 md:grid-cols-2">
        <Card title="Strategies">
          <p className="text-xs text-muted-foreground">
            {strategies.data?.length ?? 0} strategy definition(s) in this session.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Author strategies via the API (createStrategy). The UI builder ships in a follow-up release.
          </p>
        </Card>
        <Card title="Runs">
          <p className="text-xs text-muted-foreground">
            {runs.data?.length ?? 0} run(s) captured. Use the runs API to fetch details and exports.
          </p>
        </Card>
        <Card title="Diagnostics">
          {diag.data ? (
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>Persistence: {diag.data.persistenceAvailable ? "available (in-memory fallback)" : "unavailable"}</li>
              <li>Datasets in use: {diag.data.datasetsInUse.length}</li>
              <li>Timeframes: {diag.data.timeframes.join(", ") || "—"}</li>
              <li>Leakage detections: {diag.data.leakageDetections}</li>
              <li>Monte Carlo runs: {diag.data.monteCarloRuns}</li>
              <li>Walk-forward runs: {diag.data.walkForwardRuns}</li>
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">Loading diagnostics…</p>
          )}
        </Card>
        <Card title="Safety guarantees">
          <ul className="list-disc pl-4 text-xs text-muted-foreground space-y-1">
            <li>Consumer of canonical signals only.</li>
            <li>No look-ahead: entries execute on the next bar's open.</li>
            <li>Monte Carlo is seeded and deterministic.</li>
            <li>Walk-forward splits are chronological; leakage is a hard blocker.</li>
            <li>Tokenized-metal symbols preserved (PAXG/XAUT/KAG — never re-mapped to XAU/XAG).</li>
          </ul>
        </Card>
      </section>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border/60 bg-background/50 p-3">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <div className="mt-2">{children}</div>
    </div>
  );
}