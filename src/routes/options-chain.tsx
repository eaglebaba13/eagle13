// Phase 26 · Stage 5 — Live Option Chain foundation UI.
//
// Read-only. NIFTY & BANKNIFTY only. No signals, no strategy output,
// no broker paths. Uses the OptionChainProvider abstraction; live data
// via Upstox, mock scenarios available in the Research panel.

import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getOptionChain,
  type GetOptionChainResult,
} from "@/lib/option-chain/option-chain.functions";
import { classifyExpiries } from "@/lib/option-chain/expiry-engine";
import { computeAtm, type AtmMode } from "@/lib/option-chain/atm-engine";
import { filterStrikes } from "@/lib/option-chain/strike-filter";
import { computeAllMetrics } from "@/lib/option-chain/metrics";
import { snapshotToCsv, snapshotToJson, buildResearchBundle } from "@/lib/option-chain/exports";
import { assessDataQuality } from "@/lib/option-chain/data-quality";
import type { OptionChainSnapshot, OptionUnderlying } from "@/lib/option-chain/types";
import {
  evaluateOptionChainCapability,
  type OptionChainCapability,
} from "@/lib/option-chain/capability";
import { safeProviderLabel } from "@/lib/provider-labels";
import { TableSkeleton, MetricCardSkeleton } from "@/components/ui/table-skeleton";

export const Route = createFileRoute("/options-chain")({
  head: () => ({
    meta: [
      { title: "Options Chain — NIFTY & BANKNIFTY · EagleBABA" },
      {
        name: "description",
        content:
          "Live read-only NIFTY and BANKNIFTY option-chain research. Snapshot, ATM, expiry, and data-quality view — no signals emitted.",
      },
      { property: "og:title", content: "Options Chain — NIFTY & BANKNIFTY" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OptionsChainPage,
});

const OptionChainChart = lazy(() => import("@/components/option-chain/OptionChainChart"));

const LS_KEY = "eb.optionChain.v1";

type Persisted = { underlying: OptionUnderlying; expiry: string | null; atmMode: AtmMode };
function loadPersisted(): Persisted {
  if (typeof window === "undefined")
    return { underlying: "NIFTY", expiry: null, atmMode: "ATM_10" };
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return { underlying: "NIFTY", expiry: null, atmMode: "ATM_10" };
    const p = JSON.parse(raw) as Partial<Persisted>;
    return {
      underlying: p.underlying === "BANKNIFTY" ? "BANKNIFTY" : "NIFTY",
      expiry: typeof p.expiry === "string" ? p.expiry : null,
      atmMode: (p.atmMode as AtmMode) ?? "ATM_10",
    };
  } catch {
    return { underlying: "NIFTY", expiry: null, atmMode: "ATM_10" };
  }
}
function savePersisted(p: Persisted): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

function download(name: string, mime: string, body: string): void {
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function OptionsChainPage() {
  const [state, setState] = useState<Persisted>(() => loadPersisted());
  const [atmMode, setAtmMode] = useState<AtmMode>(() => loadPersisted().atmMode);
  const [result, setResult] = useState<GetOptionChainResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showResearch, setShowResearch] = useState(false);
  const [mockScenario, setMockScenario] = useState<string>("");

  const fetchChain = useServerFn(getOptionChain);

  const load = useCallback(
    async (opts: { useMock?: boolean; scenario?: string } = {}) => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const r = await fetchChain({
          data: {
            underlying: state.underlying,
            expiry: state.expiry ?? undefined,
            useMock: opts.useMock ?? false,
            mockScenario: opts.scenario,
          },
        });
        setResult(r);
        if (!r.ok) setErrorMsg(r.meta.safeError ?? "provider unavailable");
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message.slice(0, 200) : "load failed");
      } finally {
        setLoading(false);
      }
    },
    [fetchChain, state.underlying, state.expiry],
  );

  // Auto-trigger "Fetch Live" on initial mount if strikes are at 0
  const autoFetchedOnMount = useRef(false);
  useEffect(() => {
    if (!autoFetchedOnMount.current) {
      autoFetchedOnMount.current = true;
      void load();
    }
  }, [load]);

  // Auto-refetch when underlying changes
  const prevUnderlying = useRef(state.underlying);
  useEffect(() => {
    if (prevUnderlying.current !== state.underlying) {
      prevUnderlying.current = state.underlying;
      void load();
    }
  }, [state.underlying, load]);

  // Auto-refetch when expiry changes
  const prevExpiry = useRef(state.expiry);
  useEffect(() => {
    if (prevExpiry.current !== state.expiry) {
      prevExpiry.current = state.expiry;
      void load();
    }
  }, [state.expiry, load]);

  useEffect(() => {
    savePersisted({ ...state, atmMode });
  }, [state, atmMode]);

  const snapshot: OptionChainSnapshot | null = result?.ok ? result.snapshot : null;
  const expiries = useMemo(() => classifyExpiries(snapshot?.availableExpiries ?? []), [snapshot]);
  const atm = useMemo(
    () => (snapshot ? computeAtm(snapshot.strikes, snapshot.spotPrice, atmMode) : null),
    [snapshot, atmMode],
  );
  const filtered = useMemo(
    () => (snapshot ? filterStrikes(snapshot, atmMode) : null),
    [snapshot, atmMode],
  );
  const metrics = useMemo(() => (filtered ? computeAllMetrics(filtered.included) : []), [filtered]);
  const quality = result?.ok ? result.quality : null;
  const capability: OptionChainCapability | null = useMemo(() => {
    if (!result) return null;
    return evaluateOptionChainCapability({
      underlying: state.underlying,
      requestedExpiry: state.expiry,
      ok: result.ok,
      snapshot: result.ok ? result.snapshot : null,
      quality: result.ok ? result.quality : null,
      meta: result.meta,
    });
  }, [result, state.underlying, state.expiry]);
  const providerAlias = safeProviderLabel(null, "OPTIONS");
  const showBlocking = capability
    ? capability.status !== "SUPPORTED" && capability.status !== "PARTIAL"
    : false;

  return (
    <div className="eb-page eb-content max-w-7xl mx-auto px-4 py-5 text-zinc-100">
      <header className="mb-4">
        <div className="text-[11px] font-mono font-bold tracking-wider text-cyan-400 mb-1 flex items-center gap-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          MARKET · OPTIONS CHAIN
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-50">
          Live Option Chain — NIFTY & BANKNIFTY
        </h1>
        <p className="mt-1 text-xs sm:text-sm text-zinc-400">
          Read-only snapshot foundation. No signals emitted at this stage. Combined PCR, Max Pain
          and OI Build-up will consume this snapshot in later phases.
        </p>
      </header>

      {/* Toolbar */}
      <div className="card-institutional p-3.5 flex flex-wrap gap-3 items-end mb-4 bg-zinc-900/60 border-zinc-800/80">
        <label className="text-xs text-zinc-400 flex flex-col gap-1">
          <span className="metric-label">Underlying</span>
          <select
            value={state.underlying}
            onChange={(e) =>
              setState((s) => ({
                ...s,
                underlying: e.target.value as OptionUnderlying,
                expiry: null,
              }))
            }
            className="bg-zinc-950/80 text-zinc-200 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-cyan-500 transition-colors"
          >
            <option value="NIFTY">NIFTY</option>
            <option value="BANKNIFTY">BANKNIFTY</option>
          </select>
        </label>
        <label className="text-xs text-zinc-400 flex flex-col gap-1">
          <span className="metric-label">Expiry</span>
          <select
            value={state.expiry ?? ""}
            onChange={(e) => setState((s) => ({ ...s, expiry: e.target.value || null }))}
            className="bg-zinc-950/80 text-zinc-200 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-cyan-500 transition-colors"
          >
            <option value="">— current weekly —</option>
            {expiries.all.map((e) => (
              <option key={e.date} value={e.date}>
                {e.date} · {e.bucket.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-400 flex flex-col gap-1">
          <span className="metric-label">Strike filter</span>
          <select
            value={atmMode}
            onChange={(e) => setAtmMode(e.target.value as AtmMode)}
            className="bg-zinc-950/80 text-zinc-200 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-cyan-500 transition-colors"
          >
            <option value="ATM">ATM</option>
            <option value="ATM_5">ATM ± 5</option>
            <option value="ATM_10">ATM ± 10</option>
            <option value="ATM_20">ATM ± 20</option>
          </select>
        </label>
        <button
          onClick={() => load()}
          disabled={loading}
          className="pill-active px-3.5 py-1.5 rounded-lg text-xs cursor-pointer hover:bg-zinc-700/80 transition-colors disabled:opacity-50"
        >
          {loading ? "Loading…" : "Fetch Live"}
        </button>
        <button
          onClick={() => load({ useMock: true, scenario: mockScenario || "SIDEWAYS" })}
          disabled={loading}
          className="px-3.5 py-1.5 rounded-lg text-xs text-zinc-300 bg-zinc-800/60 border border-zinc-700/60 hover:bg-zinc-700/60 transition-colors cursor-pointer disabled:opacity-50"
        >
          Fetch Mock
        </button>
        {snapshot && (
          <div className="flex items-center gap-1.5 ml-auto">
            <button
              onClick={() =>
                download(
                  `option-chain-${snapshot.instrument}-${snapshot.expiry}.csv`,
                  "text/csv",
                  snapshotToCsv(snapshot),
                )
              }
              className="px-2.5 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-900/40 border border-zinc-800 hover:border-zinc-700 transition-colors"
            >
              CSV
            </button>
            <button
              onClick={() =>
                download(
                  `option-chain-${snapshot.instrument}-${snapshot.expiry}.json`,
                  "application/json",
                  snapshotToJson(snapshot),
                )
              }
              className="px-2.5 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-900/40 border border-zinc-800 hover:border-zinc-700 transition-colors"
            >
              JSON
            </button>
            {quality && (
              <button
                onClick={() =>
                  download(
                    `option-chain-bundle-${snapshot.instrument}.json`,
                    "application/json",
                    JSON.stringify(buildResearchBundle(snapshot, quality), null, 2),
                  )
                }
                className="px-2.5 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-900/40 border border-zinc-800 hover:border-zinc-700 transition-colors"
              >
                Bundle
              </button>
            )}
          </div>
        )}
      </div>

      {capability && showBlocking && (
        <CapabilityCard
          capability={capability}
          onRetry={() => load()}
          onMock={() => load({ useMock: true, scenario: mockScenario || "SIDEWAYS" })}
        />
      )}
      {capability && !showBlocking && capability.status === "PARTIAL" && (
        <div style={warnBox}>Partial snapshot · {capability.reason}</div>
      )}
      {errorMsg && !capability && (
        <div style={errorBox}>
          {providerAlias}: {errorMsg}
        </div>
      )}

      {/* Header cards */}
      {!showBlocking && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 sm:gap-3 mb-4">
          <Card label="Spot" value={snapshot?.spotPrice ?? "—"} accent="cyan" />
          <Card label="ATM" value={atm?.atm ?? "—"} accent="emerald" />
          <Card label="Expiry" value={snapshot?.expiry ?? "—"} />
          <Card label="Total Strikes" value={snapshot?.strikes.length ?? 0} />
          <Card label="Filtered" value={filtered?.included.length ?? 0} />
          <Card label="Provider" value={providerAlias} />
          <Card
            label="Freshness"
            value={snapshot?.timestamp ? relativeTime(snapshot.timestamp) : "—"}
          />
          <Card
            label="Quality"
            value={quality?.ok ? "OK" : quality ? `${quality.issues.length} issue(s)` : "—"}
            accent={quality?.ok ? "emerald" : "amber"}
          />
        </div>
      )}

      {/* Loading state indicator during initial fetch */}
      {loading && !snapshot && (
        <div className="mt-4 space-y-4 animate-in fade-in duration-300">
          <MetricCardSkeleton count={4} />
          <TableSkeleton rows={10} cols={8} title={`Live Option Chain — ${state.underlying}`} />
        </div>
      )}

      {/* Chart */}
      {filtered && filtered.included.length > 0 && (
        <Suspense fallback={<div className="p-4 text-xs text-zinc-500">Loading chart…</div>}>
          <OptionChainChart
            strikes={filtered.included}
            spot={snapshot?.spotPrice ?? null}
            atm={atm?.atm ?? null}
          />
        </Suspense>
      )}

      {/* Strike table */}
      {metrics.length > 0 && (
        <div className="table-responsive-container mt-4 border border-zinc-800/80 rounded-xl overflow-hidden bg-zinc-950/40 backdrop-blur-md">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="sticky top-0 bg-zinc-900/90 backdrop-blur-md border-b border-zinc-800/80">
                <Th>Call OI</Th>
                <Th>Call ΔOI</Th>
                <Th>Call Vol</Th>
                <Th>Call IV</Th>
                <Th center>Strike</Th>
                <Th>Put IV</Th>
                <Th>Put Vol</Th>
                <Th>Put ΔOI</Th>
                <Th>Put OI</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/40">
              {metrics.map((m) => {
                const isAtm = m.strike === atm?.atm;
                return (
                  <tr
                    key={m.strike}
                    className={`transition-colors hover:bg-zinc-800/30 ${
                      isAtm ? "bg-cyan-950/25 border-y border-cyan-500/30 text-cyan-200" : ""
                    }`}
                  >
                    <Td>{fmt(m.callOi)}</Td>
                    <Td>{fmt(m.callChangeOi)}</Td>
                    <Td>{fmt(m.callVolume)}</Td>
                    <Td>{fmt(m.callIv)}</Td>
                    <Td center bold className={isAtm ? "text-cyan-300 font-extrabold" : "text-zinc-100"}>
                      {m.strike}
                    </Td>
                    <Td>{fmt(m.putIv)}</Td>
                    <Td>{fmt(m.putVolume)}</Td>
                    <Td>{fmt(m.putChangeOi)}</Td>
                    <Td>{fmt(m.putOi)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Research panel */}
      <div className="card-institutional mt-5 overflow-hidden border-zinc-800/80">
        <button
          onClick={() => setShowResearch((s) => !s)}
          className="w-full text-left px-4 py-3 text-xs font-medium text-zinc-300 hover:text-cyan-300 transition-colors flex items-center justify-between"
        >
          <span>{showResearch ? "▼" : "▶"} Research Panel {snapshot ? `(${snapshot.strikes.length} strikes)` : ""}</span>
          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Diagnostics</span>
        </button>
        {showResearch && (
          <div className="p-4 border-t border-zinc-800/60 text-xs text-zinc-300 space-y-3 bg-zinc-950/30">
            <div className="flex gap-3 items-center mb-2">
              <label className="text-zinc-400 text-xs flex items-center gap-2">
                <span>Mock scenario:</span>
                <select
                  value={mockScenario}
                  onChange={(e) => setMockScenario(e.target.value)}
                  className="bg-zinc-900 border border-zinc-800 text-zinc-200 rounded px-2 py-1 text-xs"
                >
                  {[
                    "",
                    "BULLISH",
                    "BEARISH",
                    "SIDEWAYS",
                    "MISSING_EXPIRY",
                    "MISSING_STRIKES",
                    "STALE",
                    "PROVIDER_FAILURE",
                    "PAUSED",
                  ].map((s) => (
                    <option key={s} value={s}>
                      {s || "(default)"}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <ResearchBlock title="Provider meta" data={result?.meta} />
            <ResearchBlock
              title="Data quality"
              data={snapshot ? assessDataQuality(snapshot) : quality}
            />
            <ResearchBlock title="Expiry selection" data={expiries} />
            <ResearchBlock title="ATM engine" data={atm} />
            <ResearchBlock
              title="Included strikes"
              data={filtered?.included.map((s) => s.strike) ?? []}
            />
            <ResearchBlock
              title="Excluded strikes"
              data={filtered?.excluded.map((s) => s.strike) ?? []}
            />
            <ResearchBlock title="Normalized snapshot" data={snapshot} />
          </div>
        )}
      </div>

      <p className="mt-5 text-[11px] text-zinc-500 font-mono">
        Foundation only. No CE/PE signals, no Decision Engine wiring, no order paths.
      </p>
    </div>
  );
}

const toolbarStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  alignItems: "flex-end",
  padding: 12,
  border: "1px solid var(--eb-border)",
  borderRadius: 12,
  background: "var(--eb-card)",
  color: "var(--eb-text)",
  marginBottom: 14,
};
const selectStyle: React.CSSProperties = {
  display: "block",
  marginTop: 4,
  padding: "6px 10px",
  background: "var(--eb-bg)",
  color: "var(--eb-text)",
  border: "1px solid var(--eb-border)",
  borderRadius: 8,
  fontSize: 12,
};
const btnPrimary: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid var(--eb-accent)",
  background: "color-mix(in srgb, var(--eb-accent) 18%, transparent)",
  color: "var(--eb-text)",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};
const btnSecondary: React.CSSProperties = {
  ...btnPrimary,
  background: "var(--eb-card)",
  borderColor: "var(--eb-border)",
  color: "var(--eb-text)",
};
const btnGhost: React.CSSProperties = {
  ...btnSecondary,
  background: "transparent",
  color: "var(--eb-text)",
};
const errorBox: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid var(--eb-bear)",
  background: "color-mix(in srgb, var(--eb-bear) 10%, transparent)",
  color: "var(--eb-bear)",
  fontSize: 12,
  marginBottom: 12,
};
const warnBox: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid var(--eb-accent)",
  background: "color-mix(in srgb, var(--eb-accent) 10%, transparent)",
  color: "var(--eb-accent)",
  fontSize: 12,
  marginBottom: 12,
};
const cardsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 8,
  marginBottom: 14,
};

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
function ResearchBlock({ title, data }: { title: string; data: unknown }) {
  return (
    <details style={{ marginBottom: 8 }}>
      <summary style={{ cursor: "pointer", opacity: 0.85 }}>{title}</summary>
      <pre
        style={{
          margin: "6px 0 0",
          padding: 10,
          background: "var(--eb-code-bg)",
          borderRadius: 8,
          overflowX: "auto",
          fontSize: 11,
        }}
      >
        {JSON.stringify(data, null, 2)}
      </pre>
    </details>
  );
}
function fmt(v: number | null): string {
  if (v == null) return "—";
  if (Math.abs(v) >= 100_000) return `${(v / 1000).toFixed(0)}k`;
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}
function CapabilityCard({
  capability,
  onRetry,
  onMock,
}: {
  capability: OptionChainCapability;
  onRetry: () => void;
  onMock: () => void;
}) {
  return (
    <div
      style={{
        marginBottom: 14,
        padding: 14,
        borderRadius: 12,
        border: "1px solid var(--eb-warn-border)",
        background: "var(--eb-warn-bg-soft)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              letterSpacing: 0.6,
              color: "var(--eb-warn-fg)",
              fontWeight: 700,
            }}
          >
            OPTION CHAIN · {capability.status.replace(/_/g, " ")}
          </div>
          <div style={{ marginTop: 6, fontSize: 14, fontWeight: 600 }}>{capability.reason}</div>
          {capability.suggestedAction && (
            <div style={{ marginTop: 4, fontSize: 12, opacity: 0.85 }}>
              Next: {capability.suggestedAction}
            </div>
          )}
        </div>
        <div style={{ fontSize: 11, opacity: 0.7, textAlign: "right" }}>
          <div>{capability.providerAlias}</div>
          <div>Stage: {capability.failingStage ?? "—"}</div>
          <div>Observed: {relativeTime(capability.observedAt)}</div>
          {capability.latencyMs != null && <div>Latency: {capability.latencyMs}ms</div>}
        </div>
      </div>
      <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {capability.retryable && (
          <button onClick={onRetry} style={btnPrimary}>
            Retry
          </button>
        )}
        <button onClick={onMock} style={btnSecondary}>
          Load Demo Snapshot
        </button>
      </div>
    </div>
  );
}
function relativeTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return new Date(t).toLocaleString();
}
