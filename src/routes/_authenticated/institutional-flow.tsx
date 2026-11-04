// Phase 3D — Institutional Flow Dashboard.
// Read-only, deterministic, canonical-consumer only. Never emits signals.

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getInstitutionalFlow,
  type InstitutionalFlowResponse,
} from "@/lib/institutional-flow/institutional-flow.functions";
import type { OptionUnderlying } from "@/lib/option-chain/types";
import { safeProviderLabel } from "@/lib/provider-labels";
import { callBounded } from "@/lib/bounded-server-call";

import { GuestUnlockCard, isAuthErrorMessage } from "@/components/auth/GuestUnlockCard";
import { TableSkeleton, MetricCardSkeleton } from "@/components/ui/table-skeleton";

export const Route = createFileRoute("/_authenticated/institutional-flow")({
  head: () => ({
    meta: [
      { title: "Institutional Flow — Derivatives Analytics · EagleBABA" },
      {
        name: "description",
        content:
          "Professional derivatives analytics — OI, Max Pain, Gamma, Sector Flow. Research only.",
      },
      { property: "og:title", content: "Institutional Flow — Derivatives Analytics" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InstitutionalFlowPage,
  errorComponent: ({ error, reset }) => {
    if (isAuthErrorMessage(error)) {
      return (
        <GuestUnlockCard
          resourceName="Institutional Flow"
          description="Access to derivatives positioning and Institutional Flow analytics requires an active research session. Sign in or continue with guest full access."
          onRetry={reset}
        />
      );
    }
    const msg = error instanceof Error ? error.message : String(error);
    return (
      <div className="p-6 text-sm text-[var(--eb-bear)]">
        <p>Institutional Flow unavailable: {msg}</p>
        <button onClick={reset} className="mt-2 rounded border border-border/60 px-3 py-1 text-xs text-[var(--eb-text)]">
          Retry
        </button>
      </div>
    );
  },
});

function InstitutionalFlowPage() {
  const [underlying, setUnderlying] = useState<OptionUnderlying>("NIFTY");
  const [report, setReport] = useState<InstitutionalFlowResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchFlow = useServerFn(getInstitutionalFlow);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const bounded = await callBounded(() => fetchFlow({ data: { underlying } }), 30_000);

      if (!bounded.ok || !bounded.data) {
        setError(bounded.error ?? "load failed");
        return;
      }

      setReport(bounded.data);
    } catch (e) {
      setError(e instanceof Error ? e.message.slice(0, 200) : "load failed");
    } finally {
      setLoading(false);
    }
  }, [fetchFlow, underlying]);

  useEffect(() => {
    void load();
  }, [load]);

  const providerAlias = safeProviderLabel(null, "OPTIONS");
  const spot = report?.spot ?? null;
  const bias = report?.summary?.bias ?? "UNAVAILABLE";

  return (
    <div className="eb-page eb-content max-w-7xl mx-auto px-4 py-5 text-zinc-100">
      <header className="mb-4">
        <div className="text-[11px] font-mono font-bold tracking-wider text-cyan-400 mb-1 flex items-center gap-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          DERIVATIVES · INSTITUTIONAL FLOW
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-50">
          Institutional Flow Dashboard
        </h1>
        <p className="mt-1 text-xs sm:text-sm text-zinc-400">
          Read-only derivatives analytics. Consumes canonical Option Chain, Combined PCR, Market
          Breadth, Decision and GTI. Never issues trade signals or orders.
        </p>
      </header>

      <div className="card-institutional p-3.5 flex flex-wrap gap-3 items-end mb-4 bg-zinc-900/60 border-zinc-800/80">
        <label className="text-xs text-zinc-400 flex flex-col gap-1">
          <span className="metric-label">Underlying</span>
          <select
            value={underlying}
            onChange={(e) => setUnderlying(e.target.value as OptionUnderlying)}
            className="bg-zinc-950/80 text-zinc-200 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-cyan-500"
          >
            <option value="NIFTY">NIFTY</option>
            <option value="BANKNIFTY">BANKNIFTY</option>
          </select>
        </label>
        <button
          onClick={load}
          disabled={loading}
          className="pill-active px-3.5 py-1.5 rounded-lg text-xs cursor-pointer hover:bg-zinc-700/80 transition-colors disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
        <span className="text-[11px] font-mono text-zinc-500 ml-auto self-center">
          {report
            ? `Generated ${new Date(report.generatedAt).toLocaleTimeString()} · ${providerAlias}`
            : ""}
        </span>
      </div>

      {error && (
        isAuthErrorMessage(error) ? (
          <GuestUnlockCard resourceName="Institutional Flow" onRetry={load} />
        ) : (
          <div className="p-3 mb-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-mono">
            Institutional Flow error: {error}
          </div>
        )
      )}

      {loading && !report && (
        <div className="space-y-4 my-4 animate-in fade-in duration-300">
          <MetricCardSkeleton count={8} />
          <TableSkeleton rows={8} cols={6} title={`Institutional Derivatives Flow — ${underlying}`} />
        </div>
      )}

      {report && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 sm:gap-3 mb-4">
            <Card label="Spot" value={spot ?? "—"} accent="cyan" />
            <Card label="ATM Strike" value={report.oi.atmStrike ?? "—"} accent="amber" />
            <Card label="Max Pain" value={report.maxPain.currentMaxPain ?? "—"} accent="emerald" />
            <Card label="Gamma Wall" value={report.gamma.gammaWallStrike ?? "—"} />
            <Card label="Gamma Flip" value={report.gamma.gammaFlipStrike ?? "—"} />
            <Card label="Highest Call OI" value={report.oi.highestCallOiStrike ?? "—"} />
            <Card label="Highest Put OI" value={report.oi.highestPutOiStrike ?? "—"} />
            <Card
              label="Positioning"
              value={bias.replace(/_/g, " ")}
              accent={bias.includes("BULL") ? "emerald" : bias.includes("BEAR") ? "rose" : "amber"}
            />
          </div>

          <Section title="Executive Summary">
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
              {report.summary.headline}
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.55 }}>
              {report.summary.rationale.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
            <div style={{ marginTop: 8, fontSize: 11, opacity: 0.65 }}>
              Evidence: {report.summary.evidence.join(" · ") || "—"}
            </div>
          </Section>

          <Section title="Build-Up Analysis">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              <MiniStat label="Call side" value={report.buildUp.callSide.replace(/_/g, " ")} />
              <MiniStat label="Put side" value={report.buildUp.putSide.replace(/_/g, " ")} />
              <MiniStat label="Overall" value={report.buildUp.overall.replace(/_/g, " ")} />
              <MiniStat label="Underlying Δ" value={fmt(report.buildUp.underlyingPriceChange)} />
              <MiniStat label="ΣΔCall OI" value={fmt(report.buildUp.totalCallChangeOi)} />
              <MiniStat label="ΣΔPut OI" value={fmt(report.buildUp.totalPutChangeOi)} />
            </div>
            <p className="mt-2 text-xs text-zinc-400">
              {report.buildUp.rationale}
            </p>
          </Section>

          <Section title="Max Pain">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <MiniStat label="Current" value={report.maxPain.currentMaxPain ?? "—"} />
              <MiniStat label="Nearest strike" value={report.maxPain.nearestMaxPain ?? "—"} />
              <MiniStat label="Δ from spot" value={fmt(report.maxPain.distanceFromSpot)} />
              <MiniStat
                label="Δ from spot %"
                value={
                  report.maxPain.distanceFromSpotPct == null
                    ? "—"
                    : `${report.maxPain.distanceFromSpotPct.toFixed(2)}%`
                }
              />
            </div>
          </Section>

          <Section title="Gamma">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              <MiniStat label="Exposure" value={fmt(report.gamma.gammaExposure)} />
              <MiniStat label="Positive Γ" value={fmt(report.gamma.positiveGamma)} />
              <MiniStat label="Negative Γ" value={fmt(report.gamma.negativeGamma)} />
              <MiniStat label="Wall" value={report.gamma.gammaWallStrike ?? "—"} />
              <MiniStat label="Flip" value={report.gamma.gammaFlipStrike ?? "—"} />
              <MiniStat label="Availability" value={report.gamma.availability} />
            </div>
            <p className="mt-2 text-xs text-zinc-400">{report.gamma.reason}</p>
          </Section>

          <Section title="Sector Flow">
            <div className="table-responsive-container border border-zinc-800/80 rounded-xl overflow-hidden bg-zinc-950/40">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="sticky top-0 bg-zinc-900/90 backdrop-blur-md border-b border-zinc-800/80">
                    <Th>Sector</Th>
                    <Th>Advances</Th>
                    <Th>Declines</Th>
                    <Th>Net</Th>
                    <Th>Weighted</Th>
                    <Th>Bias</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/40 font-mono">
                  {report.sectorFlow.rows.map((r) => (
                    <tr key={r.id} className="hover:bg-zinc-800/30 transition-colors">
                      <Td>{r.name}</Td>
                      <Td>{r.advances ?? "—"}</Td>
                      <Td>{r.declines ?? "—"}</Td>
                      <Td>{fmt(r.netBreadth)}</Td>
                      <Td>{fmt(r.weightedBreadth)}</Td>
                      <Td>
                        <span style={biasStyle(r.bias)}>{r.bias}</span>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Market Internals">
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
              <MiniStat label="Advances" value={report.internals.advances ?? "—"} />
              <MiniStat label="Declines" value={report.internals.declines ?? "—"} />
              <MiniStat label="A/D ratio" value={fmt(report.internals.advanceDeclineRatio)} />
              <MiniStat label="PCR" value={fmt(report.internals.pcr)} />
              <MiniStat label="PCR state" value={report.internals.pcrState} />
              <MiniStat label="VIX" value={fmt(report.internals.vix)} />
              <MiniStat label="Decision" value={report.internals.decisionAction} />
              <MiniStat
                label="GTI"
                value={`${report.internals.gtiState} (${Math.round(report.internals.gtiConfidence * 100)}%)`}
              />
            </div>
          </Section>

          <Section title="OI Heatmap">
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-1.5">
              {report.heatmap.cells.map((c) => (
                <div
                  key={c.strike}
                  title={`Strike ${c.strike} · OI ${c.totalOi ?? "—"}`}
                  className={`p-2 rounded-lg text-center font-mono text-[11px] transition-transform hover:scale-105 ${
                    c.isAtm
                      ? "border border-cyan-400 bg-cyan-950/40 text-cyan-200"
                      : c.isMaxPain
                      ? "border border-amber-400/80 border-dashed bg-amber-950/30 text-amber-200"
                      : "border border-zinc-800/80 bg-zinc-900/40 text-zinc-300"
                  }`}
                >
                  <div className="font-bold">{c.strike}</div>
                  <div className="text-[10px] opacity-75">{fmt(c.totalOi)}</div>
                </div>
              ))}
            </div>
          </Section>

          <Section title="OI Analysis (per-strike)">
            <div className="table-responsive-container border border-zinc-800/80 rounded-xl overflow-hidden bg-zinc-950/40">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="sticky top-0 bg-zinc-900/90 backdrop-blur-md border-b border-zinc-800/80">
                    <Th>Call OI</Th>
                    <Th>Call ΔOI</Th>
                    <Th center>Strike</Th>
                    <Th>Put ΔOI</Th>
                    <Th>Put OI</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/40 font-mono">
                  {report.oi.rows.map((r) => (
                    <tr
                      key={r.strike}
                      className={`hover:bg-zinc-800/30 transition-colors ${
                        r.isAtm ? "bg-cyan-950/25 border-y border-cyan-500/30 text-cyan-200" : ""
                      }`}
                    >
                      <Td>{fmt(r.callOi)}</Td>
                      <Td>{fmt(r.callChangeOi)}</Td>
                      <Td center bold className={r.isAtm ? "text-cyan-300 font-extrabold" : "text-zinc-100"}>
                        {r.strike}
                      </Td>
                      <Td>{fmt(r.putChangeOi)}</Td>
                      <Td>{fmt(r.putOi)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <p style={disclaimer}>{report.disclaimer}</p>
        </>
      )}
    </div>
  );
}

function Card({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: "cyan" | "emerald" | "amber" | "rose";
}) {
  const accentColor =
    accent === "cyan"
      ? "text-cyan-400"
      : accent === "emerald"
      ? "text-emerald-400"
      : accent === "amber"
      ? "text-amber-400"
      : accent === "rose"
      ? "text-rose-400"
      : "text-zinc-100";

  return (
    <div className="card-institutional p-3 flex flex-col justify-between">
      <div className="metric-label">{label}</div>
      <div className={`metric-value mt-1.5 ${accentColor}`}>{value}</div>
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card-institutional p-4 mb-4 border-zinc-800/80 bg-zinc-900/40">
      <div className="metric-label text-cyan-400 mb-3 flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
        {title.toUpperCase()}
      </div>
      {children}
    </section>
  );
}
function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="p-2.5 bg-zinc-950/60 border border-zinc-800/80 rounded-lg">
      <div className="metric-label">{label}</div>
      <div className="text-xs sm:text-sm font-bold font-mono text-zinc-100 mt-1">{value}</div>
    </div>
  );
}
function Th({ children, center }: { children: React.ReactNode; center?: boolean }) {
  return (
    <th
      className={`px-3 py-2.5 font-mono text-[11px] font-semibold text-zinc-400 uppercase tracking-wider ${
        center ? "text-center" : "text-right"
      }`}
    >
      {children}
    </th>
  );
}
function Td({
  children,
  center,
  bold,
  className = "",
}: {
  children: React.ReactNode;
  center?: boolean;
  bold?: boolean;
  className?: string;
}) {
  return (
    <td
      className={`px-3 py-2 font-mono text-xs ${
        center ? "text-center" : "text-right"
      } ${bold ? "font-bold text-zinc-100" : "text-zinc-300"} ${className}`}
    >
      {children}
    </td>
  );
}
function fmt(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (Math.abs(v) >= 100_000) return `${(v / 1000).toFixed(0)}k`;
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}
function biasStyle(b: string): React.CSSProperties {
  const color =
    b === "BULLISH"
      ? "#6bffb0"
      : b === "BEARISH"
        ? "#ff8a8a"
        : b === "NEUTRAL"
          ? "#e6f1f7"
          : "#888";
  return { color, fontWeight: 600, fontSize: 12 };
}

const label: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: 0.6,
  fontWeight: 700,
  color: "#6bd3ff",
  marginBottom: 6,
};
const toolbar: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "flex-end",
  padding: 12,
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 12,
  background: "rgba(255,255,255,0.03)",
  marginBottom: 14,
};
const selectStyle: React.CSSProperties = {
  display: "block",
  marginTop: 4,
  padding: "6px 10px",
  background: "#0d1a24",
  color: "#e6f1f7",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 8,
  fontSize: 12,
};
const btnPrimary: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid rgba(107,211,255,0.4)",
  background: "rgba(107,211,255,0.15)",
  color: "#cfefff",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};
const errorBox: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid rgba(255,120,120,0.35)",
  background: "rgba(255,120,120,0.08)",
  color: "#ffb3b3",
  fontSize: 12,
  marginBottom: 12,
};
const cardsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 8,
  marginBottom: 14,
};
const grid2: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 8,
};
const tbl: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 12 };
const disclaimer: React.CSSProperties = { marginTop: 18, fontSize: 11, opacity: 0.55 };
