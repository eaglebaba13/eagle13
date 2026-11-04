// Phase 27 · Stage 1 — Combined PCR (LIVE consumer).
//
// Research-only. Consumes ONLY the Option Chain Foundation via the
// getCombinedPcr server function. Never touches broker paths.

import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getCombinedPcr,
  type GetCombinedPcrResult,
} from "@/lib/combined-pcr/combined-pcr.functions";
import {
  DEFAULT_COMBINED_PCR_WEIGHTS,
  DISCLAIMER,
  FORMULA_VERSION,
  type CombinedPcrWeights,
} from "@/lib/combined-pcr/types";
import type { AtmMode } from "@/lib/option-chain/atm-engine";
import {
  buildCombinedPcrResearchBundle,
  readingToCsv,
  readingToJson,
} from "@/lib/combined-pcr/exports";
import {
  PersistentPcrHistory,
  readingToPersisted,
  type PersistedPcrPoint,
} from "@/lib/combined-pcr/persistent-history";
import {
  readingToShadowSample,
  summarizeShadowObservations,
  type ShadowSample,
} from "@/lib/combined-pcr/shadow-validation";
import { callBounded } from "@/lib/bounded-server-call";
import { TableSkeleton, MetricCardSkeleton } from "@/components/ui/table-skeleton";

export const Route = createFileRoute("/combined-pcr")({
  head: () => ({
    meta: [
      { title: "Combined PCR — NIFTY + BANKNIFTY · EagleBABA Research" },
      {
        name: "description",
        content:
          "Research-only Combined Put/Call Ratio for NIFTY and BANKNIFTY. Weighted score, EMA slope, and 7-state research signal — no BUY / SELL emitted.",
      },
      { property: "og:title", content: "Combined PCR — Research" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CombinedPcrPage,
});

const CombinedPcrChart = lazy(() => import("@/components/combined-pcr/CombinedPcrChart"));

function download(name: string, mime: string, body: string): void {
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function fmt(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}

function CombinedPcrPage() {
  const fetchPcr = useServerFn(getCombinedPcr);
  const [result, setResult] = useState<GetCombinedPcrResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [atmMode, setAtmMode] = useState<AtmMode>("ATM_10");
  const [weights, setWeights] = useState<CombinedPcrWeights>(DEFAULT_COMBINED_PCR_WEIGHTS);
  const [useMock, setUseMock] = useState(false);
  const [mockScenario, setMockScenario] = useState("BULLISH");
  const [showResearch, setShowResearch] = useState(false);
  const [persisted, setPersisted] = useState<readonly PersistedPcrPoint[]>([]);
  const [shadowSamples, setShadowSamples] = useState<readonly ShadowSample[]>([]);

  const historyRef = useRef<PersistentPcrHistory | null>(null);
  if (!historyRef.current) {
    historyRef.current = new PersistentPcrHistory();
  }

  useEffect(() => {
    setPersisted(historyRef.current!.load());
  }, []);

  const prevConf = useRef<{ confirmed: string; pending: string; count: number }>({
    confirmed: "NO_TRADE",
    pending: "NO_TRADE",
    count: 1,
  });

  const weightSum = weights.NIFTY + weights.BANKNIFTY;
  const weightsValid = Math.abs(weightSum - 1) < 1e-3;

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const bounded = await callBounded(
        () =>
          fetchPcr({
            data: {
              atmMode,
              weights,
              useMock,
              mockScenario: useMock ? mockScenario : undefined,
              previousConfirmed: prevConf.current.confirmed,
              previousPending: prevConf.current.pending,
              previousCount: prevConf.current.count,
            },
          }),
        30_000,
      );

      if (!bounded.ok || !bounded.data) {
        setError(bounded.error ?? "request failed");
        return;
      }

      const res = bounded.data;
      setResult(res);
      if (res.ok && res.reading) {
        prevConf.current = {
          confirmed: res.reading.confirmedState,
          pending: res.reading.pendingState,
          count: res.reading.confirmationCount,
        };
        try {
          const point = readingToPersisted(res.reading, atmMode);
          const next = historyRef.current!.append(point);
          setPersisted(next);
        } catch {
          /* best-effort */
        }
        setShadowSamples((prev) => [...prev, readingToShadowSample(res.reading!)].slice(-200));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "request failed");
    } finally {
      setLoading(false);
    }
  }, [fetchPcr, atmMode, weights, useMock, mockScenario]);

  useEffect(() => {
    void run();
  }, [run]);

  const reading = result && result.ok ? result.reading : null;
  const capabilities = result && result.ok ? result.capabilities : undefined;
  const capabilityStatus = result && result.ok ? result.capabilityStatus : undefined;
  const computed = result && result.ok ? result.computed : false;
  const capabilityBlocking = Boolean(result?.ok) && !computed;
  const freshness = useMemo(() => {
    if (!reading) return null;
    return Math.max(0, Date.now() - Date.parse(reading.timestamp));
  }, [reading]);

  return (
    <div className="eb-page eb-content max-w-7xl mx-auto px-4 py-5 text-zinc-100">
      {/* Research badge */}
      <div className="inline-flex items-center gap-2 text-[10px] font-mono font-bold tracking-wider px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 mb-3">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
        RESEARCH ONLY · NO BUY / SELL SIGNAL
      </div>

      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-50 mb-1">
        Combined PCR — Derivatives Research
      </h1>
      <p className="text-xs sm:text-sm text-zinc-400 mb-4">
        Weighted OI + ΔOI research score across NIFTY and BANKNIFTY. SENSEX{" "}
        <span className="text-amber-400 font-semibold font-mono text-xs">COMING SOON</span>.
      </p>

      {/* Capability panel — replaces fake NO_TRADE metrics when unsupported */}
      {capabilityBlocking && capabilities && (
        <div className="card-institutional p-4 mb-4 border-amber-500/40 bg-amber-500/5">
          <div className="text-[11px] font-mono font-bold text-amber-400 mb-1.5">
            COMBINED PCR · {String(capabilityStatus ?? "UNAVAILABLE").replace(/_/g, " ")}
          </div>
          <div className="text-xs text-zinc-300 mb-3">
            Score not calculated — option data unavailable for one or more underlyings.
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {Object.entries(capabilities).map(([u, cap]) =>
              cap ? (
                <div
                  key={u}
                  className="card-institutional p-3 text-xs bg-zinc-950/60 border-zinc-800"
                >
                  <div className="font-bold text-zinc-100 mb-1">
                    {u} · {cap.status.replace(/_/g, " ")}
                  </div>
                  <div className="text-zinc-400 mb-1">{cap.reason}</div>
                  {cap.suggestedAction && (
                    <div className="text-zinc-500 mb-1">Next: {cap.suggestedAction}</div>
                  )}
                  <div className="text-[10px] font-mono text-zinc-500">
                    {cap.providerAlias} · stage {cap.failingStage ?? "—"} · observed{" "}
                    {cap.observedAt}
                    {cap.latencyMs != null ? ` · ${cap.latencyMs}ms` : ""}
                  </div>
                </div>
              ) : null,
            )}
          </div>
          <button
            onClick={() => void run()}
            disabled={loading}
            className="pill-active px-3.5 py-1.5 rounded-lg text-xs cursor-pointer hover:bg-zinc-700/80 transition-colors disabled:opacity-50 mt-3"
          >
            {loading ? "Retrying…" : "Retry"}
          </button>
        </div>
      )}

      {loading && !reading && (
        <div className="mb-4 space-y-4 animate-in fade-in duration-300">
          <MetricCardSkeleton count={4} />
          <TableSkeleton rows={8} cols={6} title="Aggregated Combined PCR Matrix" />
        </div>
      )}

      {/* Header stats — hidden when capability blocks calculation to avoid fake zeros */}
      {!capabilityBlocking && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3 mb-4">
          <Stat
            label="Combined Score"
            value={fmt(reading?.combinedScore, 2)}
            accent={reading?.combinedScore != null ? (reading.combinedScore > 1 ? "emerald" : reading.combinedScore < 0.9 ? "rose" : "amber") : undefined}
          />
          <Stat
            label="Direction"
            value={reading?.direction ?? "—"}
            accent={reading?.direction?.includes("BULL") ? "emerald" : reading?.direction?.includes("BEAR") ? "rose" : undefined}
          />
          <Stat
            label="Research Signal"
            value={reading?.signalState ?? "—"}
            accent={reading?.signalState?.includes("BULL") ? "emerald" : reading?.signalState?.includes("BEAR") ? "rose" : "cyan"}
          />
          <Stat label="EMA Fast" value={fmt(reading?.emaFast, 2)} />
          <Stat label="EMA Slow" value={fmt(reading?.emaSlow, 2)} />
          <Stat label="Slope" value={fmt(reading?.slope, 3)} accent={reading?.slope != null && reading.slope > 0 ? "emerald" : "rose"} />
          <Stat label="Prev Slope" value={fmt(reading?.previousSlope, 3)} />
          <Stat label="Slope Δ" value={fmt(reading?.slopeChange, 3)} />
          <Stat label="Confirmed" value={reading?.confirmedState ?? "—"} accent="cyan" />
          <Stat label="ATM Mode" value={atmMode} />
          <Stat
            label="Freshness"
            value={freshness == null ? "—" : `${(freshness / 1000).toFixed(0)}s`}
          />
        </div>
      )}

      {/* Controls */}
      <div className="card-institutional p-3.5 flex flex-wrap gap-3 items-center mb-4 bg-zinc-900/60 border-zinc-800/80">
        <label className="text-xs text-zinc-400 flex flex-col gap-1">
          <span className="metric-label">ATM</span>
          <select
            value={atmMode}
            onChange={(e) => setAtmMode(e.target.value as AtmMode)}
            className="bg-zinc-950/80 text-zinc-200 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-cyan-500 transition-colors"
          >
            <option value="ATM">ATM</option>
            <option value="ATM_5">ATM ±5</option>
            <option value="ATM_10">ATM ±10</option>
            <option value="ATM_20">ATM ±20</option>
          </select>
        </label>
        <label className="text-xs text-zinc-400 flex flex-col gap-1">
          <span className="metric-label">NIFTY %</span>
          <input
            type="number"
            step={5}
            min={0}
            max={100}
            value={Math.round(weights.NIFTY * 100)}
            onChange={(e) => {
              const n = Math.min(100, Math.max(0, Number(e.target.value) || 0)) / 100;
              setWeights({ NIFTY: n, BANKNIFTY: Math.max(0, 1 - n) });
            }}
            className="bg-zinc-950/80 text-zinc-200 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs w-20 focus:outline-none focus:border-cyan-500 font-mono"
          />
        </label>
        <label className="text-xs text-zinc-400 flex flex-col gap-1">
          <span className="metric-label">BANKNIFTY %</span>
          <input
            type="number"
            step={5}
            min={0}
            max={100}
            value={Math.round(weights.BANKNIFTY * 100)}
            onChange={(e) => {
              const b = Math.min(100, Math.max(0, Number(e.target.value) || 0)) / 100;
              setWeights({ NIFTY: Math.max(0, 1 - b), BANKNIFTY: b });
            }}
            className="bg-zinc-950/80 text-zinc-200 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs w-20 focus:outline-none focus:border-cyan-500 font-mono"
          />
        </label>
        <label className="text-xs text-zinc-400 flex items-center gap-2 mt-4 cursor-pointer">
          <input
            type="checkbox"
            checked={useMock}
            onChange={(e) => setUseMock(e.target.checked)}
            className="rounded border-zinc-700 bg-zinc-900 text-cyan-500 focus:ring-0"
          />
          <span>Mock</span>
        </label>
        {useMock && (
          <div className="flex flex-col gap-1">
            <span className="metric-label">Scenario</span>
            <select
              value={mockScenario}
              onChange={(e) => setMockScenario(e.target.value)}
              className="bg-zinc-950/80 text-zinc-200 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs"
            >
              {["BULLISH", "BEARISH", "SIDEWAYS", "STALE", "MISSING_STRIKES", "PROVIDER_FAILURE"].map(
                (s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ),
              )}
            </select>
          </div>
        )}
        <button
          onClick={() => void run()}
          disabled={loading || !weightsValid}
          className="pill-active px-3.5 py-1.5 rounded-lg text-xs cursor-pointer hover:bg-zinc-700/80 transition-colors disabled:opacity-50 mt-auto"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
        {!weightsValid && (
          <span className="text-xs text-rose-400 font-mono mt-auto">
            Weights must sum to 100%
          </span>
        )}
      </div>

      {/* Chart */}
      <div className="card-institutional p-4 mb-4 border-zinc-800/80">
        <Suspense fallback={<div className="text-xs text-zinc-500 p-4">Loading chart…</div>}>
          {reading && <CombinedPcrChart reading={reading} />}
        </Suspense>
      </div>

      {/* Warnings */}
      {reading && reading.warnings.length > 0 && (
        <div className="p-3 mb-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
          <div className="font-bold font-mono mb-1">Data quality warnings:</div>
          <ul className="list-disc pl-4 space-y-0.5 opacity-90">
            {reading.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <div className="p-3 mb-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-mono">
          Error: {error}
        </div>
      )}
      {result && !result.ok && (
        <div className="p-3 mb-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-mono">
          Provider unavailable: {result.safeError ?? "unknown"}
        </div>
      )}

      {/* Instrument table */}
      {reading && (
        <div className="table-responsive-container mb-4 border border-zinc-800/80 rounded-xl overflow-hidden bg-zinc-950/40 backdrop-blur-md">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="sticky top-0 bg-zinc-900/90 backdrop-blur-md border-b border-zinc-800/80 text-left">
                {[
                  "Underlying",
                  "Raw OI PCR",
                  "Raw ΔOI PCR",
                  "Norm OI",
                  "Norm ΔOI",
                  "Score",
                  "Weight",
                  "Strikes",
                  "ATM",
                  "Expiry",
                  "Provider",
                ].map((h) => (
                  <th key={h} className="px-3 py-2.5 font-mono text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/40 font-mono">
              {reading.instruments.map((i) => (
                <tr key={i.underlying} className="hover:bg-zinc-800/30 transition-colors">
                  <td className="px-3 py-2 font-bold text-zinc-100">{i.underlying}</td>
                  <td className="px-3 py-2 text-zinc-300">{fmt(i.rawOiPcr, 3)}</td>
                  <td className="px-3 py-2 text-zinc-300">{fmt(i.rawChangeOiPcr, 3)}</td>
                  <td className="px-3 py-2 text-zinc-300">{fmt(i.normalizedOiPcr)}</td>
                  <td className="px-3 py-2 text-zinc-300">{fmt(i.normalizedChangeOiPcr)}</td>
                  <td className="px-3 py-2 font-bold text-cyan-400">{fmt(i.instrumentScore)}</td>
                  <td className="px-3 py-2 text-zinc-300">{fmt(i.weight * 100, 1)}%</td>
                  <td className="px-3 py-2 text-zinc-400">{i.strikeCount}</td>
                  <td className="px-3 py-2 text-amber-300">{i.atm ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-400">{i.expiry ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-400">{i.provider}</td>
                </tr>
              ))}
              <tr className="opacity-50 text-zinc-500">
                <td className="px-3 py-2 font-bold">SENSEX</td>
                <td className="px-3 py-2 font-mono" colSpan={10}>
                  COMING SOON
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Exports */}
      {reading && (
        <div className="flex gap-2 flex-wrap mb-4">
          <button
            className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-900/40 border border-zinc-800 hover:border-zinc-700 transition-colors"
            onClick={() =>
              download(`combined-pcr-${reading.runId}.csv`, "text/csv", readingToCsv(reading))
            }
          >
            Export CSV
          </button>
          <button
            className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-900/40 border border-zinc-800 hover:border-zinc-700 transition-colors"
            onClick={() =>
              download(
                `combined-pcr-${reading.runId}.json`,
                "application/json",
                readingToJson(reading),
              )
            }
          >
            Export JSON
          </button>
          <button
            className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-900/40 border border-zinc-800 hover:border-zinc-700 transition-colors"
            onClick={() =>
              download(
                `combined-pcr-bundle-${reading.runId}.json`,
                "application/json",
                JSON.stringify(
                  buildCombinedPcrResearchBundle(
                    reading,
                    undefined,
                    capabilities as never,
                    capabilityStatus,
                  ),
                  null,
                  2,
                ),
              )
            }
          >
            Research Bundle
          </button>
        </div>
      )}

      {/* Research panel */}
      <div className="card-institutional overflow-hidden border-zinc-800/80 mb-4">
        <button
          onClick={() => setShowResearch((v) => !v)}
          className="w-full text-left px-4 py-3 text-xs font-medium text-zinc-300 hover:text-cyan-300 transition-colors flex items-center justify-between"
        >
          <span>{showResearch ? "▼" : "▶"} Research Panel</span>
          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Formula Diagnostics</span>
        </button>
        {showResearch && reading && (
          <div className="p-4 border-t border-zinc-800/60 text-xs text-zinc-300 space-y-2 bg-zinc-950/30">
            <div>
              <b className="text-zinc-400">Run ID:</b> {reading.runId}
            </div>
            <div>
              <b className="text-zinc-400">Formula:</b> {FORMULA_VERSION}
            </div>
            <div>
              <b className="text-zinc-400">Disclaimer:</b> {DISCLAIMER}
            </div>
            <div>
              <b className="text-zinc-400">Confirmed:</b> {reading.confirmedState} · <b className="text-zinc-400">Pending:</b> {reading.pendingState} ·{" "}
              <b className="text-zinc-400">Count:</b> {reading.confirmationCount}
            </div>
            <div>
              <b className="text-zinc-400">Zero Cross:</b> {String(reading.zeroCross)}
            </div>
            <div>
              <b className="text-zinc-400">Snapshots:</b> {reading.instruments.map((i) => i.snapshotId).join(" | ")}
            </div>
            <div>
              <b className="text-zinc-400">Warnings:</b>{" "}
              {reading.warnings.length === 0 ? "none" : reading.warnings.join("; ")}
            </div>
            <div>
              <b className="text-zinc-400">Provider Meta:</b>{" "}
              <code className="text-[11px] font-mono text-zinc-400">
                {JSON.stringify(
                  result?.ok ? (result as { providerMeta: unknown }).providerMeta : {},
                )}
              </code>
            </div>
          </div>
        )}
      </div>

      {/* Persistent history + shadow validation */}
      {(persisted.length > 0 || shadowSamples.length > 0) && (
        <div className="card-institutional p-4 border-zinc-800/80 text-xs text-zinc-300">
          <div className="font-bold text-zinc-100 mb-1">
            History (persistent): {persisted.length} points · Shadow observations:{" "}
            {summarizeShadowObservations(shadowSamples).length}
          </div>
          <div className="text-zinc-400 mb-3">
            Persistent storage retains up to {historyRef.current?.capacity ?? 500} readings across
            reloads. Shadow validation is research-only — no BUY / SELL emitted.
          </div>
          <button
            className="px-3 py-1.5 rounded-lg text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 transition-colors"
            onClick={() => {
              historyRef.current?.clear();
              setPersisted([]);
              setShadowSamples([]);
            }}
          >
            Clear history
          </button>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
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
