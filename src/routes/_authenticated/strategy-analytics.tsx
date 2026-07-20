// Phase 29 — Strategy Analytics dashboard.
// Analytical only. Consumer of the existing Decision Engine.

import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/common";
import {
  analyseHistory,
  STRATEGY_VALIDATION_DISCLAIMER,
  type AnalyticsReport,
} from "@/lib/strategy-validation";

export const Route = createFileRoute("/_authenticated/strategy-analytics")({
  head: () => ({
    meta: [
      { title: "Strategy Analytics — EagleBABA" },
      {
        name: "description",
        content:
          "Deterministic historical replay & validation of the Decision Engine. Research only.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: StrategyAnalyticsPage,
});

function StrategyAnalyticsPage() {
  const [tab, setTab] = useState<
    | "overview"
    | "performance"
    | "regime"
    | "calibration"
    | "contribution"
    | "journal"
    | "failure"
  >("overview");

  // Analytics is fed via a cached historical snapshot list. Until an ingest
  // adapter is wired, the report is empty and renders UNAVAILABLE — no
  // fabricated values.
  const report: AnalyticsReport = useMemo(() => analyseHistory([]), []);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <header>
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          STRATEGY VALIDATION · HISTORICAL REPLAY
        </div>
        <h1 className="text-xl font-semibold text-foreground">Strategy Analytics</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Replays historical snapshots through the existing Decision Engine. No trading logic
          is modified.
        </p>
      </header>

      <div
        role="note"
        className="rounded-md border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
      >
        {STRATEGY_VALIDATION_DISCLAIMER}
      </div>

      <nav className="flex flex-wrap gap-2 border-b border-border/60 pb-2 text-xs">
        {(
          [
            ["overview", "Overview"],
            ["performance", "Performance"],
            ["regime", "Regime Analysis"],
            ["calibration", "Confidence Calibration"],
            ["contribution", "Contribution Analysis"],
            ["journal", "Trade Journal"],
            ["failure", "Failure Analysis"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-md border px-3 py-1 ${
              tab === id
                ? "border-primary/60 bg-primary/10 text-primary"
                : "border-border/60 text-muted-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {!report.available ? (
        <EmptyState
          title="No historical snapshots yet"
          description={
            report.note ||
            "Historical snapshot ingestion is not yet wired to this UI. Once ≥30 replayed snapshots are cached, every panel populates deterministically."
          }
        />
      ) : (
        <ReportView tab={tab} report={report} />
      )}
    </div>
  );
}

function ReportView({
  tab,
  report,
}: {
  tab:
    | "overview"
    | "performance"
    | "regime"
    | "calibration"
    | "contribution"
    | "journal"
    | "failure";
  report: AnalyticsReport;
}) {
  if (tab === "overview" || tab === "performance") {
    const o = report.overall;
    return (
      <div className="grid gap-3 md:grid-cols-2">
        <Card title="Overall performance">
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>Total trades: {o.totalTrades}</li>
            <li>
              Winning / Losing / Skipped: {o.winning} / {o.losing} / {o.skipped}
            </li>
            <li>Win rate: {o.winRate}%</li>
            <li>Avg winner / loser: {o.avgWinner}% / {o.avgLoser}%</li>
            <li>
              Profit factor:{" "}
              {o.profitFactor == null
                ? "—"
                : Number.isFinite(o.profitFactor)
                  ? o.profitFactor
                  : "∞"}
            </li>
            <li>Expectancy: {o.expectancy}%</li>
            <li>Max drawdown: {o.maxDrawdown}%</li>
            <li>Recovery factor: {o.recoveryFactor ?? "—"}</li>
            <li>Sharpe: {o.sharpe ?? "—"}</li>
          </ul>
        </Card>
        <Card title="Decision breakdown">
          <Table
            head={["Action", "Trades", "Win %", "Avg %", "Max +", "Max −"]}
            rows={report.decisionBreakdown.map((r) => [
              r.action,
              r.trades,
              `${r.winRate}%`,
              `${r.avgReturn}%`,
              `${r.maxGain}%`,
              `${r.maxLoss}%`,
            ])}
          />
        </Card>
        <Card title="VIX analysis">
          <Table
            head={["Bucket", "Signals", "Win %", "Avg %", "Hold (bars)"]}
            rows={report.vixBreakdown.map((v) => [
              v.bucket,
              v.signals,
              `${v.winRate}%`,
              `${v.avgReturn}%`,
              v.avgHoldingBars,
            ])}
          />
        </Card>
        <Card title="Strike analysis">
          <Table
            head={["Moneyness", "Trades", "Win %", "Avg move %", "Hold"]}
            rows={report.strikeBreakdown.map((s) => [
              s.moneyness,
              s.trades,
              `${s.winRate}%`,
              `${s.avgPremiumMovePct}%`,
              s.avgHoldingBars,
            ])}
          />
        </Card>
      </div>
    );
  }

  if (tab === "regime") {
    return (
      <Card title="Market regime performance">
        <Table
          head={["Regime", "Trades", "Wins", "Losses", "Win %", "Avg %"]}
          rows={report.regimeBreakdown.map((r) => [
            r.regime,
            r.trades,
            r.wins,
            r.losses,
            `${r.winRate}%`,
            `${r.avgReturn}%`,
          ])}
        />
      </Card>
    );
  }

  if (tab === "calibration") {
    return (
      <Card title="Confidence calibration">
        <Table
          head={["Bucket", "Trades", "Actual win rate", "Sample"]}
          rows={report.calibration.map((c) => [
            c.bucket,
            c.trades,
            `${c.actualWinRate}%`,
            c.lowSample ? "LOW SAMPLE SIZE" : "OK",
          ])}
        />
      </Card>
    );
  }

  if (tab === "contribution") {
    return (
      <Card title="Engine contribution">
        <Table
          head={["Engine", "Agreement %", "Contribution %", "Historical win %", "Sample"]}
          rows={report.contribution.map((c) => [
            c.label,
            `${c.agreementPct}%`,
            `${c.contributionPct}%`,
            `${c.historicalWinRate}%`,
            c.lowSample ? `${c.sample} (LOW)` : c.sample,
          ])}
        />
      </Card>
    );
  }

  if (tab === "failure") {
    return (
      <Card title="Failure analysis">
        <Table
          head={["Category", "Count", "Frequency %"]}
          rows={report.failures.map((f) => [f.category, f.count, `${f.frequencyPct}%`])}
        />
      </Card>
    );
  }

  // journal
  return (
    <Card title={`Trade journal (${report.journal.length})`}>
      <div className="max-h-[480px] overflow-auto">
        <Table
          head={["Time", "Action", "Conf", "Bull", "Bear", "Outcome", "Return %"]}
          rows={report.journal.map((j) => [
            j.timestamp,
            j.action,
            j.confidence,
            j.bullScore,
            j.bearScore,
            j.outcome,
            `${j.returnPct}%`,
          ])}
        />
      </div>
    </Card>
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

function Table({
  head,
  rows,
}: {
  head: readonly string[];
  rows: readonly (readonly (string | number)[])[];
}) {
  if (rows.length === 0)
    return <p className="text-xs text-muted-foreground">No rows.</p>;
  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr className="text-left text-muted-foreground">
          {head.map((h) => (
            <th key={h} className="border-b border-border/60 py-1 pr-3 font-medium">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="text-foreground">
            {r.map((c, j) => (
              <td key={j} className="border-b border-border/40 py-1 pr-3">
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}