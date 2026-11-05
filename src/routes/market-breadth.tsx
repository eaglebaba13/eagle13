// Phase 27 · Stage 3 — Market Breadth · GTI research page.
//
// RESEARCH ONLY. No BUY / SELL emitted. No broker/order paths.

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getMarketBreadth,
  type GetMarketBreadthResult,
} from "@/lib/market-breadth/market-breadth.functions";
import type { MarketBreadthCapability } from "@/lib/market-breadth/capability";
import type { MockScenario } from "@/lib/market-breadth/mock-provider";
import type { MarketBreadthSnapshot } from "@/lib/market-breadth/types";
import { buildResearchBundle, readingToCsv, readingToJson } from "@/lib/market-breadth/exports";
import {
  PersistentMarketBreadthHistory,
  readingToPersisted,
  type PersistedGtiPoint,
} from "@/lib/market-breadth/persistent-history";
import {
  readingToShadowSample,
  summarizeGtiShadow,
  type GtiShadowSample,
} from "@/lib/market-breadth/shadow-validation";
import { callBounded } from "@/lib/bounded-server-call";
import { TableSkeleton, MetricCardSkeleton } from "@/components/ui/table-skeleton";

export const Route = createFileRoute("/market-breadth")({
  head: () => ({
    meta: [
      { title: "Market Breadth · GTI Research — EagleBABA" },
      {
        name: "description",
        content:
          "Research-only Market Breadth, VIX regime, Sector rotation and PCR confirmation for NIFTY and BANKNIFTY. No BUY / SELL emitted.",
      },
      { property: "og:title", content: "Market Breadth — Research" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MarketBreadthPage,
});

function download(name: string, mime: string, body: string): void {
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function fmt(v: number | null | undefined, d = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(d);
}

function BreadthCard({ title, s }: { title: string; s: MarketBreadthSnapshot | null }) {
  return (
    <div className="card-institutional p-3.5 flex flex-col justify-between">
      <div className="metric-label">{title}</div>
      {!s || s.dataQuality === "FAILED" ? (
        <div className="text-xs text-zinc-500 mt-2">Unavailable</div>
      ) : (
        <div className="space-y-2 mt-2">
          <div className="flex gap-2.5 text-xs font-mono flex-wrap">
            <span className="text-emerald-400 font-semibold">▲ {s.advances}</span>
            <span className="text-rose-400 font-semibold">▼ {s.declines}</span>
            <span className="text-zinc-400">= {s.unchanged}</span>
            <span className="text-zinc-600">? {s.unavailable}</span>
          </div>
          <div className="text-xs font-mono text-zinc-200">
            Net: <b className={s.netBreadth != null && s.netBreadth > 0 ? "text-emerald-400" : s.netBreadth != null && s.netBreadth < 0 ? "text-rose-400" : "text-zinc-200"}>{s.netBreadth ?? "—"}</b>
            {s.weightedBreadth != null && (
              <>
                {" "}· Wtd: <b className="text-cyan-400">{fmt(s.weightedBreadth, 3)}</b>
              </>
            )}
          </div>
          <div className="text-[10px] font-mono text-zinc-500">
            Coverage {((s.constituentCoverage ?? 0) * 100).toFixed(0)}% · {s.dataQuality} · {s.freshness}
            {s.registryVersion && <> · {s.registryVersion}</>}
          </div>
        </div>
      )}
    </div>
  );
}

function MarketBreadthPage() {
  const fetchGti = useServerFn(getMarketBreadth);
  const [result, setResult] = useState<GetMarketBreadthResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scenario, setScenario] = useState<MockScenario>("MIXED");
  const [vix, setVix] = useState<string>("");
  const [previousVix, setPreviousVix] = useState<string>("");
  const [showResearch, setShowResearch] = useState(false);
  const [persisted, setPersisted] = useState<readonly PersistedGtiPoint[]>([]);
  const [samples, setSamples] = useState<readonly GtiShadowSample[]>([]);

  const historyRef = useRef<PersistentMarketBreadthHistory | null>(null);
  if (!historyRef.current) historyRef.current = new PersistentMarketBreadthHistory();

  useEffect(() => {
    setPersisted(historyRef.current!.load());
  }, []);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const parsedVix = vix === "" ? null : Number(vix);
      const parsedPrev = previousVix === "" ? null : Number(previousVix);
      const bounded = await callBounded(
        () =>
          fetchGti({
            data: {
              mockScenario: scenario,
              vix: Number.isFinite(parsedVix) ? parsedVix : null,
              previousVix: Number.isFinite(parsedPrev) ? parsedPrev : null,
              attachLive: true,
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
        try {
          const next = historyRef.current!.append(readingToPersisted(res.reading));
          setPersisted(next);
        } catch {
          /* best-effort */
        }
        setSamples((prev) => [...prev, readingToShadowSample(res.reading!)].slice(-200));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "request failed");
    } finally {
      setLoading(false);
    }
  }, [fetchGti, scenario, vix, previousVix]);

  useEffect(() => {
    void run();
  }, [run]);

  const reading = result && result.ok ? result.reading : null;
  const capability: MarketBreadthCapability | null =
    result && result.ok ? result.capability : result && !result.ok ? result.capability : null;
  const vixMeta = result && result.ok ? result.vixMeta : null;
  const pcrMeta = result && result.ok ? result.pcrMeta : null;
  const providerAlias =
    result && (result.ok || !result.ok)
      ? (result.providerAlias ?? "Breadth Provider")
      : "Breadth Provider";
  const observations = useMemo(() => summarizeGtiShadow(samples), [samples]);

  const buttonStyle: React.CSSProperties = {
    background: "var(--eb-warn-bg)",
    border: "1px solid var(--eb-warn-border)",
    color: "var(--eb-warn-fg)",
    padding: "6px 12px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  };

  return (
    <div className="w-full max-w-[1800px] mx-auto px-2 sm:px-4 lg:px-6 py-4 flex flex-col gap-4 overflow-x-hidden text-zinc-100">
      <div className="inline-flex items-center gap-2 text-[10px] font-mono font-bold tracking-wider px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 mb-3">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
        RESEARCH ONLY · NO BUY / SELL SIGNAL
      </div>

      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-50 mb-1">
        Market Breadth · GTI Research
      </h1>
      <p className="text-xs sm:text-sm text-zinc-400 mb-4">
        Combined breadth, VIX regime, sector rotation and Combined PCR confirmation. SENSEX, MCX,
        Crypto and Global metals COMING SOON.
      </p>

      {capability && (
        <CapabilityBanner
          c={capability}
          providerAlias={providerAlias}
          vixMeta={vixMeta}
          pcrMeta={pcrMeta}
        />
      )}

      {loading && !reading && (
        <div className="mb-4 space-y-4 animate-in fade-in duration-300">
          <MetricCardSkeleton count={4} />
          <TableSkeleton rows={8} cols={5} title="Live Market Breadth & Sector Matrix" />
        </div>
      )}

      {/* Header stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3 mb-4">
        <Stat
          label="Research State"
          value={reading?.state ?? "—"}
          accent={reading?.state?.includes("BULL") ? "emerald" : reading?.state?.includes("BEAR") ? "rose" : "cyan"}
        />
        <Stat label="Confidence" value={reading ? `${reading.confidence}` : "—"} accent="cyan" />
        <Stat label="VIX Regime" value={reading?.vix.regime ?? "—"} accent="amber" />
        <Stat label="PCR Confirm" value={reading?.pcr.confirmedState ?? "—"} />
        <Stat label="Conflicts" value={reading ? `${reading.conflicts.length}` : "—"} accent={reading?.conflicts.length ? "rose" : undefined} />
        <Stat
          label="Broad Coverage"
          value={
            reading?.breadth.broad
              ? `${((reading.breadth.broad.constituentCoverage ?? 0) * 100).toFixed(0)}%`
              : "—"
          }
        />
      </div>

      {/* Controls */}
      <div className="card-institutional p-3.5 flex flex-wrap gap-3 items-center mb-4 bg-zinc-900/60 border-zinc-800/80">
        <label className="text-xs text-zinc-400 flex flex-col gap-1">
          <span className="metric-label">Scenario</span>
          <select
            value={scenario}
            onChange={(e) => setScenario(e.target.value as MockScenario)}
            className="bg-zinc-950/80 text-zinc-200 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-amber-500/50"
          >
            {["BULLISH", "BEARISH", "MIXED", "PARTIAL", "STALE"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-400 flex flex-col gap-1">
          <span className="metric-label">VIX</span>
          <input
            type="number"
            step={0.1}
            value={vix}
            onChange={(e) => setVix(e.target.value)}
            placeholder="—"
            className="bg-zinc-950/80 text-zinc-200 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs w-20 font-mono focus:outline-none focus:border-amber-500/50"
          />
        </label>
        <label className="text-xs text-zinc-400 flex flex-col gap-1">
          <span className="metric-label">Prev VIX</span>
          <input
            type="number"
            step={0.1}
            value={previousVix}
            onChange={(e) => setPreviousVix(e.target.value)}
            placeholder="—"
            className="bg-zinc-950/80 text-zinc-200 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs w-20 font-mono focus:outline-none focus:border-amber-500/50"
          />
        </label>
        <button
          onClick={() => void run()}
          disabled={loading}
          className="pill-active px-3.5 py-1.5 rounded-lg text-xs cursor-pointer hover:bg-zinc-700/80 transition-colors disabled:opacity-50 mt-auto"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {/* Breadth cards */}
      {reading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3 mb-4">
          <BreadthCard title="Broad NSE" s={reading.breadth.broad} />
          <BreadthCard title="NIFTY50" s={reading.breadth.nifty50} />
          <BreadthCard title="Top-Weighted" s={reading.breadth.topWeighted} />
          {reading.breadth.sectors.map((s) => (
            <BreadthCard key={s.universe} title={s.universe.replace("SECTOR_", "")} s={s} />
          ))}
        </div>
      )}

      {/* Conflicts */}
      {reading && reading.conflicts.length > 0 && (
        <div
          style={{
            padding: 12,
            marginBottom: 16,
            borderRadius: 8,
            background: "var(--eb-danger-bg)",
            border: "1px solid var(--eb-danger-border)",
          }}
        >
          <div
            style={{ fontSize: 12, fontWeight: 700, color: "var(--eb-danger-fg)", marginBottom: 6 }}
          >
            Conflicts
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, opacity: 0.85 }}>
            {reading.conflicts.map((c) => (
              <li key={c.code}>
                <b>{c.code}</b> — {c.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <div style={{ color: "var(--eb-danger-fg)", marginBottom: 16, fontSize: 13 }}>
          Error: {error}
        </div>
      )}
      {result && !result.ok && (
        <div style={{ color: "var(--eb-danger-fg)", marginBottom: 16, fontSize: 13 }}>
          Provider unavailable: {result.safeError ?? "unknown"}
        </div>
      )}

      {/* Exports */}
      {reading && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          <button
            style={buttonStyle}
            onClick={() =>
              download(`market-breadth-${reading.runId}.csv`, "text/csv", readingToCsv(reading))
            }
          >
            Export CSV
          </button>
          <button
            style={buttonStyle}
            onClick={() =>
              download(
                `market-breadth-${reading.runId}.json`,
                "application/json",
                readingToJson(reading),
              )
            }
          >
            Export JSON
          </button>
          <button
            style={buttonStyle}
            onClick={() =>
              download(
                `market-breadth-bundle-${reading.runId}.json`,
                "application/json",
                JSON.stringify(
                  buildResearchBundle(reading, {
                    capability,
                    providerAlias,
                    breadthSource: capability?.source ?? null,
                  }),
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
      <div style={{ border: "1px solid var(--eb-line)", borderRadius: 10, overflow: "hidden" }}>
        <button
          onClick={() => setShowResearch((v) => !v)}
          style={{
            width: "100%",
            textAlign: "left",
            padding: "10px 14px",
            background: "var(--eb-tint)",
            color: "inherit",
            border: "none",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          {showResearch ? "▼" : "▶"} Research Panel
        </button>
        {showResearch && reading && (
          <div style={{ padding: 14, fontSize: 12, lineHeight: 1.7 }}>
            <div>
              <b>Run ID:</b> {reading.runId}
            </div>
            <div>
              <b>Formula:</b> {reading.formulaVersion}
            </div>
            <div>
              <b>Disclaimer:</b> {reading.disclaimer}
            </div>
            <div>
              <b>Confidence components</b>
              <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 4 }}>
                Sub-scores that combine into the single canonical confidence value
                <strong> ({reading.confidence})</strong> shown above.
              </div>
              <code style={{ fontSize: 11 }}>{JSON.stringify(reading.confidenceBreakdown)}</code>
            </div>
            <div>
              <b>PCR:</b> <code style={{ fontSize: 11 }}>{JSON.stringify(reading.pcr)}</code>
            </div>
            <div>
              <b>VIX:</b> <code style={{ fontSize: 11 }}>{JSON.stringify(reading.vix)}</code>
            </div>
          </div>
        )}
      </div>

      {/* Persistent history + shadow */}
      {(persisted.length > 0 || samples.length > 0) && (
        <div className="card-institutional p-4 border-zinc-800/80 text-xs text-zinc-300 mt-4">
          <div className="font-bold text-zinc-100 mb-1">
            Persistent History: {persisted.length} · Shadow observations: {observations.length}
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
              setSamples([]);
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

function CapabilityBanner({
  c,
  providerAlias,
  vixMeta,
  pcrMeta,
}: {
  c: MarketBreadthCapability;
  providerAlias: string;
  vixMeta: {
    providerAlias: string;
    freshness: string;
    timestamp: string;
    latencyMs: number | null;
    error: string | null;
  } | null;
  pcrMeta: {
    providerAlias: string;
    available: boolean;
    quality: string;
    latencyMs: number | null;
    error: string | null;
    instrumentCapabilities: Record<string, string>;
  } | null;
}) {
  const ok = c.status === "SUPPORTED";
  const partial = c.status === "PARTIAL" || c.status === "STALE";
  const bg = ok ? "var(--eb-ok-bg)" : partial ? "var(--eb-warn-bg)" : "var(--eb-danger-bg)";
  const border = ok
    ? "var(--eb-ok-border)"
    : partial
      ? "var(--eb-warn-border)"
      : "var(--eb-danger-border)";
  return (
    <div
      style={{
        marginBottom: 14,
        padding: 12,
        borderRadius: 10,
        background: bg,
        border: `1px solid ${border}`,
        display: "grid",
        gap: 8,
        gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
        fontSize: 12,
      }}
    >
      <div>
        <div style={{ fontSize: 10, opacity: 0.7, textTransform: "uppercase", letterSpacing: 0.4 }}>
          Capability
        </div>
        <div style={{ fontWeight: 700, marginTop: 2 }}>{c.status}</div>
        <div style={{ opacity: 0.8, marginTop: 2 }}>{c.reason}</div>
        <div style={{ opacity: 0.6, marginTop: 2 }}>
          {providerAlias}
          {c.latencyMs != null ? ` · ${c.latencyMs}ms` : ""}
          {" · "}source: {c.source === "RESEARCH_DEMO" ? "RESEARCH DEMO" : c.source}
        </div>
      </div>
      <div>
        <div style={{ fontSize: 10, opacity: 0.7, textTransform: "uppercase", letterSpacing: 0.4 }}>
          India VIX
        </div>
        {vixMeta ? (
          <>
            <div style={{ opacity: 0.85, marginTop: 2 }}>
              {vixMeta.providerAlias} · {vixMeta.freshness}
            </div>
            <div style={{ opacity: 0.55, marginTop: 2 }}>
              {vixMeta.timestamp}
              {vixMeta.latencyMs != null ? ` · ${vixMeta.latencyMs}ms` : ""}
            </div>
            {vixMeta.error && (
              <div style={{ color: "var(--eb-danger-fg)", marginTop: 2 }}>{vixMeta.error}</div>
            )}
          </>
        ) : (
          <div style={{ opacity: 0.6 }}>—</div>
        )}
      </div>
      <div>
        <div style={{ fontSize: 10, opacity: 0.7, textTransform: "uppercase", letterSpacing: 0.4 }}>
          Combined PCR
        </div>
        {pcrMeta ? (
          <>
            <div style={{ opacity: 0.85, marginTop: 2 }}>
              {pcrMeta.providerAlias} · {pcrMeta.available ? pcrMeta.quality : "UNAVAILABLE"}
            </div>
            <div style={{ opacity: 0.55, marginTop: 2 }}>
              {Object.entries(pcrMeta.instrumentCapabilities)
                .map(([k, v]) => `${k}:${v}`)
                .join(" · ") || "no instruments"}
              {pcrMeta.latencyMs != null ? ` · ${pcrMeta.latencyMs}ms` : ""}
            </div>
            {pcrMeta.error && (
              <div style={{ color: "var(--eb-danger-fg)", marginTop: 2 }}>{pcrMeta.error}</div>
            )}
          </>
        ) : (
          <div style={{ opacity: 0.6 }}>—</div>
        )}
      </div>
    </div>
  );
}
