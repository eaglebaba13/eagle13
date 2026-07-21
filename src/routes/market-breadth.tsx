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
import {
  buildResearchBundle,
  readingToCsv,
  readingToJson,
} from "@/lib/market-breadth/exports";
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
    <div style={{
      padding: 12, borderRadius: 10,
      border: "1px solid var(--eb-line)",
      background: "var(--eb-tint-soft)",
    }}>
      <div style={{ fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase", opacity: 0.6, marginBottom: 4 }}>
        {title}
      </div>
      {!s || s.dataQuality === "FAILED" ? (
        <div style={{ fontSize: 13, opacity: 0.6 }}>Unavailable</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 10, fontSize: 12, flexWrap: "wrap" }}>
            <span style={{ color: "var(--eb-ok-fg)" }}>▲ {s.advances}</span>
            <span style={{ color: "var(--eb-danger-fg)" }}>▼ {s.declines}</span>
            <span style={{ opacity: 0.7 }}>= {s.unchanged}</span>
            <span style={{ opacity: 0.5 }}>? {s.unavailable}</span>
          </div>
          <div style={{ fontSize: 12, marginTop: 4 }}>
            Net: <b>{s.netBreadth}</b>
            {s.weightedBreadth != null && <> · Weighted: <b>{fmt(s.weightedBreadth, 3)}</b></>}
          </div>
          <div style={{ fontSize: 11, opacity: 0.55, marginTop: 2 }}>
            Coverage {((s.constituentCoverage ?? 0) * 100).toFixed(0)}% · {s.dataQuality} · {s.freshness}
            {s.registryVersion && <> · {s.registryVersion}</>}
          </div>
        </>
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

  useEffect(() => { setPersisted(historyRef.current!.load()); }, []);

  const run = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const parsedVix = vix === "" ? null : Number(vix);
      const parsedPrev = previousVix === "" ? null : Number(previousVix);
      const res = await fetchGti({
        data: {
          mockScenario: scenario,
          vix: Number.isFinite(parsedVix) ? parsedVix : null,
          previousVix: Number.isFinite(parsedPrev) ? parsedPrev : null,
          attachLive: true,
        },
      });
      setResult(res);
      if (res.ok && res.reading) {
        try {
          const next = historyRef.current!.append(readingToPersisted(res.reading));
          setPersisted(next);
        } catch { /* best-effort */ }
        setSamples((prev) => [...prev, readingToShadowSample(res.reading!)].slice(-200));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "request failed");
    } finally { setLoading(false); }
  }, [fetchGti, scenario, vix, previousVix]);

  useEffect(() => { void run(); }, [run]);

  const reading = result && result.ok ? result.reading : null;
  const capability: MarketBreadthCapability | null =
    result && result.ok ? result.capability : result && !result.ok ? result.capability : null;
  const vixMeta = result && result.ok ? result.vixMeta : null;
  const pcrMeta = result && result.ok ? result.pcrMeta : null;
  const providerAlias = result && (result.ok || !result.ok) ? (result.providerAlias ?? "Breadth Provider") : "Breadth Provider";
  const observations = useMemo(() => summarizeGtiShadow(samples), [samples]);

  const buttonStyle: React.CSSProperties = {
    background: "var(--eb-warn-bg)",
    border: "1px solid var(--eb-warn-border)",
    color: "var(--eb-warn-fg)", padding: "6px 12px", borderRadius: 6,
    fontSize: 12, fontWeight: 600, cursor: "pointer",
  };

  return (
    <div className="eb-page eb-content" style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 20px" }}>
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        fontSize: 11, fontWeight: 700, letterSpacing: 0.6,
        padding: "4px 10px", borderRadius: 999,
        background: "var(--eb-warn-bg)", color: "var(--eb-warn-fg)",
        border: "1px solid var(--eb-warn-border)", marginBottom: 12,
      }}>
        RESEARCH ONLY · NO BUY / SELL SIGNAL
      </div>

      <h1 style={{ margin: "0 0 6px", fontSize: 28, fontWeight: 700 }}>Market Breadth · GTI Research</h1>
      <p style={{ margin: "0 0 20px", opacity: 0.7, fontSize: 14 }}>
        Combined breadth, VIX regime, sector rotation and Combined PCR confirmation.
        SENSEX, MCX, Crypto and Global metals COMING SOON.
      </p>

      {capability && (
        <CapabilityBanner c={capability} providerAlias={providerAlias} vixMeta={vixMeta} pcrMeta={pcrMeta} />
      )}

      {/* Header stats */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        gap: 10, marginBottom: 16,
      }}>
        <Stat label="Research State" value={reading?.state ?? "—"} />
        <Stat label="Confidence" value={reading ? `${reading.confidence}` : "—"} />
        <Stat label="VIX Regime" value={reading?.vix.regime ?? "—"} />
        <Stat label="PCR Confirm" value={reading?.pcr.confirmedState ?? "—"} />
        <Stat label="Conflicts" value={reading ? `${reading.conflicts.length}` : "—"} />
        <Stat label="Broad Coverage" value={reading?.breadth.broad ? `${((reading.breadth.broad.constituentCoverage ?? 0) * 100).toFixed(0)}%` : "—"} />
      </div>

      {/* Controls */}
      <div style={{
        display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center",
        padding: 12, borderRadius: 10,
        background: "var(--eb-tint-soft)",
        border: "1px solid var(--eb-hairline)",
        marginBottom: 16,
      }}>
        <label style={{ fontSize: 11, opacity: 0.85, display: "flex", flexDirection: "column", gap: 4 }}>
          Scenario
          <select value={scenario} onChange={(e) => setScenario(e.target.value as MockScenario)}
            style={{ background: "var(--eb-tint-strong)", border: "1px solid var(--eb-divider)", color: "inherit", padding: "5px 8px", borderRadius: 6, fontSize: 12 }}>
            {["BULLISH", "BEARISH", "MIXED", "PARTIAL", "STALE"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 11, opacity: 0.85, display: "flex", flexDirection: "column", gap: 4 }}>
          VIX
          <input type="number" step={0.1} value={vix} onChange={(e) => setVix(e.target.value)} placeholder="—"
            style={{ background: "var(--eb-tint-strong)", border: "1px solid var(--eb-divider)", color: "inherit", padding: "5px 8px", borderRadius: 6, fontSize: 12, width: 80 }} />
        </label>
        <label style={{ fontSize: 11, opacity: 0.85, display: "flex", flexDirection: "column", gap: 4 }}>
          Prev VIX
          <input type="number" step={0.1} value={previousVix} onChange={(e) => setPreviousVix(e.target.value)} placeholder="—"
            style={{ background: "var(--eb-tint-strong)", border: "1px solid var(--eb-divider)", color: "inherit", padding: "5px 8px", borderRadius: 6, fontSize: 12, width: 80 }} />
        </label>
        <button onClick={() => void run()} disabled={loading} style={buttonStyle}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {/* Breadth cards */}
      {reading && (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 10, marginBottom: 16,
        }}>
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
        <div style={{
          padding: 12, marginBottom: 16, borderRadius: 8,
          background: "var(--eb-danger-bg)",
          border: "1px solid var(--eb-danger-border)",
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--eb-danger-fg)", marginBottom: 6 }}>Conflicts</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, opacity: 0.85 }}>
            {reading.conflicts.map((c) => <li key={c.code}><b>{c.code}</b> — {c.message}</li>)}
          </ul>
        </div>
      )}

      {error && (
        <div style={{ color: "var(--eb-danger-fg)", marginBottom: 16, fontSize: 13 }}>Error: {error}</div>
      )}
      {result && !result.ok && (
        <div style={{ color: "var(--eb-danger-fg)", marginBottom: 16, fontSize: 13 }}>
          Provider unavailable: {result.safeError ?? "unknown"}
        </div>
      )}

      {/* Exports */}
      {reading && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          <button style={buttonStyle} onClick={() => download(`market-breadth-${reading.runId}.csv`, "text/csv", readingToCsv(reading))}>Export CSV</button>
          <button style={buttonStyle} onClick={() => download(`market-breadth-${reading.runId}.json`, "application/json", readingToJson(reading))}>Export JSON</button>
          <button style={buttonStyle} onClick={() => download(`market-breadth-bundle-${reading.runId}.json`, "application/json", JSON.stringify(buildResearchBundle(reading, { capability, providerAlias, breadthSource: capability?.source ?? null }), null, 2))}>Research Bundle</button>
        </div>
      )}

      {/* Research panel */}
      <div style={{ border: "1px solid var(--eb-line)", borderRadius: 10, overflow: "hidden" }}>
        <button
          onClick={() => setShowResearch((v) => !v)}
          style={{
            width: "100%", textAlign: "left", padding: "10px 14px",
            background: "var(--eb-tint)", color: "inherit",
            border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13,
          }}
        >
          {showResearch ? "▼" : "▶"} Research Panel
        </button>
        {showResearch && reading && (
          <div style={{ padding: 14, fontSize: 12, lineHeight: 1.7 }}>
            <div><b>Run ID:</b> {reading.runId}</div>
            <div><b>Formula:</b> {reading.formulaVersion}</div>
            <div><b>Disclaimer:</b> {reading.disclaimer}</div>
            <div>
              <b>Confidence components</b>
              <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 4 }}>
                Sub-scores that combine into the single canonical confidence value
                <strong> ({reading.confidence})</strong> shown above.
              </div>
              <code style={{ fontSize: 11 }}>{JSON.stringify(reading.confidenceBreakdown)}</code>
            </div>
            <div><b>PCR:</b> <code style={{ fontSize: 11 }}>{JSON.stringify(reading.pcr)}</code></div>
            <div><b>VIX:</b> <code style={{ fontSize: 11 }}>{JSON.stringify(reading.vix)}</code></div>
          </div>
        )}
      </div>

      {/* Persistent history + shadow */}
      {(persisted.length > 0 || samples.length > 0) && (
        <div style={{
          marginTop: 16, border: "1px solid var(--eb-line)",
          borderRadius: 10, padding: 12, fontSize: 12,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            Persistent history: {persisted.length} · Shadow observations: {observations.length}
          </div>
          <button style={buttonStyle} onClick={() => {
            historyRef.current?.clear();
            setPersisted([]); setSamples([]);
          }}>Clear history</button>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      padding: "8px 10px", borderRadius: 8,
      border: "1px solid var(--eb-hairline)",
      background: "var(--eb-tint-soft)",
    }}>
      <div style={{ fontSize: 10, letterSpacing: 0.4, opacity: 0.6, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{value}</div>
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
  vixMeta: { providerAlias: string; freshness: string; timestamp: string; latencyMs: number | null; error: string | null } | null;
  pcrMeta: { providerAlias: string; available: boolean; quality: string; latencyMs: number | null; error: string | null; instrumentCapabilities: Record<string, string> } | null;
}) {
  const ok = c.status === "SUPPORTED";
  const partial = c.status === "PARTIAL" || c.status === "STALE";
  const bg = ok
    ? "var(--eb-ok-bg)"
    : partial
      ? "var(--eb-warn-bg)"
      : "var(--eb-danger-bg)";
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
              {Object.entries(pcrMeta.instrumentCapabilities).map(([k, v]) => `${k}:${v}`).join(" · ") || "no instruments"}
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
