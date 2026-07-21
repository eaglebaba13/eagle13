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
      const res = await fetchPcr({
        data: {
          atmMode,
          weights,
          useMock,
          mockScenario: useMock ? mockScenario : undefined,
          previousConfirmed: prevConf.current.confirmed,
          previousPending: prevConf.current.pending,
          previousCount: prevConf.current.count,
        },
      });
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
        } catch { /* best-effort */ }
        setShadowSamples((prev) => [...prev, readingToShadowSample(res.reading!)].slice(-200));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "request failed");
    } finally {
      setLoading(false);
    }
  }, [fetchPcr, atmMode, weights, useMock, mockScenario]);

  useEffect(() => { void run(); }, [run]);

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
    <div className="eb-page eb-content" style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px" }}>
      {/* Research badge */}
      <div
        style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          fontSize: 11, fontWeight: 700, letterSpacing: 0.6,
          padding: "4px 10px", borderRadius: 999,
          background: "var(--eb-warn-bg)", color: "var(--eb-warn-fg)",
          border: "1px solid var(--eb-warn-border)", marginBottom: 12,
        }}
      >
        RESEARCH ONLY · NO BUY / SELL SIGNAL
      </div>

      <h1 style={{ margin: "0 0 6px", fontSize: 28, fontWeight: 700 }}>Combined PCR</h1>
      <p style={{ margin: "0 0 20px", opacity: 0.7, fontSize: 14 }}>
        Weighted OI + ΔOI research score across NIFTY and BANKNIFTY. SENSEX{" "}
        <span style={{ color: "var(--eb-warn-fg)", fontWeight: 600 }}>COMING SOON</span>.
      </p>

      {/* Capability panel — replaces fake NO_TRADE metrics when unsupported */}
      {capabilityBlocking && capabilities && (
        <div style={{
          padding: 14, marginBottom: 16, borderRadius: 10,
          background: "var(--eb-warn-bg-soft)",
          border: "1px solid var(--eb-warn-border-soft)",
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, color: "var(--eb-warn-fg)", marginBottom: 6 }}>
            COMBINED PCR · {String(capabilityStatus ?? "UNAVAILABLE").replace(/_/g, " ")}
          </div>
          <div style={{ fontSize: 13, marginBottom: 10 }}>
            Score not calculated — option data unavailable for one or more underlyings.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 8 }}>
            {Object.entries(capabilities).map(([u, cap]) => cap ? (
              <div key={u} style={{
                padding: 10, borderRadius: 8,
                background: "var(--eb-tint)",
                border: "1px solid var(--eb-line)",
                fontSize: 12,
              }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>{u} · {cap.status.replace(/_/g, " ")}</div>
                <div style={{ opacity: 0.85, marginBottom: 4 }}>{cap.reason}</div>
                {cap.suggestedAction && (
                  <div style={{ opacity: 0.7, marginBottom: 4 }}>Next: {cap.suggestedAction}</div>
                )}
                <div style={{ opacity: 0.6, fontSize: 11 }}>
                  {cap.providerAlias} · stage {cap.failingStage ?? "—"} · observed {cap.observedAt}
                  {cap.latencyMs != null ? ` · ${cap.latencyMs}ms` : ""}
                </div>
              </div>
            ) : null)}
          </div>
          <button onClick={() => void run()} disabled={loading} style={{ ...buttonStyle, marginTop: 10 }}>
            {loading ? "Retrying…" : "Retry"}
          </button>
        </div>
      )}

      {/* Header stats — hidden when capability blocks calculation to avoid fake zeros */}
      {!capabilityBlocking && <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        gap: 10, marginBottom: 16,
      }}>
        <Stat label="Combined Score" value={fmt(reading?.combinedScore, 2)} />
        <Stat label="Direction" value={reading?.direction ?? "—"} />
        <Stat label="Research Signal" value={reading?.signalState ?? "—"} />
        <Stat label="EMA Fast" value={fmt(reading?.emaFast, 2)} />
        <Stat label="EMA Slow" value={fmt(reading?.emaSlow, 2)} />
        <Stat label="Slope" value={fmt(reading?.slope, 3)} />
        <Stat label="Prev Slope" value={fmt(reading?.previousSlope, 3)} />
        <Stat label="Slope Δ" value={fmt(reading?.slopeChange, 3)} />
        <Stat label="Confirmed" value={reading?.confirmedState ?? "—"} />
        <Stat label="ATM Mode" value={atmMode} />
        <Stat
          label="Freshness"
          value={freshness == null ? "—" : `${(freshness / 1000).toFixed(0)}s`}
        />
      </div>}

      {/* Controls */}
      <div style={{
        display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center",
        padding: 12, borderRadius: 10,
        background: "var(--eb-tint-soft)",
        border: "1px solid var(--eb-hairline)",
        marginBottom: 16,
      }}>
        <label style={labelStyle}>ATM
          <select value={atmMode} onChange={(e) => setAtmMode(e.target.value as AtmMode)} style={selectStyle}>
            <option value="ATM">ATM</option>
            <option value="ATM_5">ATM ±5</option>
            <option value="ATM_10">ATM ±10</option>
            <option value="ATM_20">ATM ±20</option>
          </select>
        </label>
        <label style={labelStyle}>NIFTY %
          <input
            type="number" step={5} min={0} max={100}
            value={Math.round(weights.NIFTY * 100)}
            onChange={(e) => {
              const n = Math.min(100, Math.max(0, Number(e.target.value) || 0)) / 100;
              setWeights({ NIFTY: n, BANKNIFTY: Math.max(0, 1 - n) });
            }}
            style={{ ...selectStyle, width: 80 }}
          />
        </label>
        <label style={labelStyle}>BANKNIFTY %
          <input
            type="number" step={5} min={0} max={100}
            value={Math.round(weights.BANKNIFTY * 100)}
            onChange={(e) => {
              const b = Math.min(100, Math.max(0, Number(e.target.value) || 0)) / 100;
              setWeights({ NIFTY: Math.max(0, 1 - b), BANKNIFTY: b });
            }}
            style={{ ...selectStyle, width: 80 }}
          />
        </label>
        <label style={{ ...labelStyle, flexDirection: "row", gap: 6 }}>
          <input type="checkbox" checked={useMock} onChange={(e) => setUseMock(e.target.checked)} />
          Mock
        </label>
        {useMock && (
          <select value={mockScenario} onChange={(e) => setMockScenario(e.target.value)} style={selectStyle}>
            {["BULLISH", "BEARISH", "SIDEWAYS", "STALE", "MISSING_STRIKES", "PROVIDER_FAILURE"].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}
        <button onClick={() => void run()} disabled={loading || !weightsValid} style={buttonStyle}>
          {loading ? "Loading…" : "Refresh"}
        </button>
        {!weightsValid && (
          <span style={{ fontSize: 12, color: "var(--eb-danger-fg)" }}>Weights must sum to 100%</span>
        )}
      </div>

      {/* Chart */}
      <div style={{ marginBottom: 20 }}>
        <Suspense fallback={<div style={{ fontSize: 12, opacity: 0.6 }}>Loading chart…</div>}>
          {reading && <CombinedPcrChart reading={reading} />}
        </Suspense>
      </div>

      {/* Warnings */}
      {reading && reading.warnings.length > 0 && (
        <div style={{
          padding: 12, marginBottom: 16, borderRadius: 8,
          background: "var(--eb-danger-bg)",
          border: "1px solid var(--eb-danger-border)",
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--eb-danger-fg)", marginBottom: 6 }}>Data quality</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, opacity: 0.85 }}>
            {reading.warnings.map((w, i) => <li key={i}>{w}</li>)}
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

      {/* Instrument table */}
      {reading && (
        <div style={{
          overflowX: "auto",
          border: "1px solid var(--eb-hairline)",
          borderRadius: 10,
          marginBottom: 16,
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead style={{ background: "var(--eb-tint)", textAlign: "left" }}>
              <tr>
                {["Underlying", "Raw OI PCR", "Raw ΔOI PCR", "Norm OI", "Norm ΔOI", "Score", "Weight", "Strikes", "ATM", "Expiry", "Provider"].map((h) => (
                  <th key={h} style={{ padding: "8px 10px", fontWeight: 600, opacity: 0.75 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reading.instruments.map((i) => (
                <tr key={i.underlying} style={{ borderTop: "1px solid var(--eb-tint-strong)" }}>
                  <td style={cell}>{i.underlying}</td>
                  <td style={cell}>{fmt(i.rawOiPcr, 3)}</td>
                  <td style={cell}>{fmt(i.rawChangeOiPcr, 3)}</td>
                  <td style={cell}>{fmt(i.normalizedOiPcr)}</td>
                  <td style={cell}>{fmt(i.normalizedChangeOiPcr)}</td>
                  <td style={cell}>{fmt(i.instrumentScore)}</td>
                  <td style={cell}>{fmt(i.weight * 100, 1)}%</td>
                  <td style={cell}>{i.strikeCount}</td>
                  <td style={cell}>{i.atm ?? "—"}</td>
                  <td style={cell}>{i.expiry ?? "—"}</td>
                  <td style={cell}>{i.provider}</td>
                </tr>
              ))}
              <tr style={{ borderTop: "1px solid var(--eb-tint-strong)", opacity: 0.55 }}>
                <td style={cell}>SENSEX</td>
                <td style={cell} colSpan={10}>COMING SOON</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Exports */}
      {reading && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
          <button style={buttonStyle} onClick={() => download(`combined-pcr-${reading.runId}.csv`, "text/csv", readingToCsv(reading))}>Export CSV</button>
          <button style={buttonStyle} onClick={() => download(`combined-pcr-${reading.runId}.json`, "application/json", readingToJson(reading))}>Export JSON</button>
        <button style={buttonStyle} onClick={() => download(`combined-pcr-bundle-${reading.runId}.json`, "application/json", JSON.stringify(buildCombinedPcrResearchBundle(reading, undefined, capabilities as never, capabilityStatus), null, 2))}>Research Bundle</button>
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
            <div><b>Formula:</b> {FORMULA_VERSION}</div>
            <div><b>Disclaimer:</b> {DISCLAIMER}</div>
            <div><b>Confirmed:</b> {reading.confirmedState} · <b>Pending:</b> {reading.pendingState} · <b>Count:</b> {reading.confirmationCount}</div>
            <div><b>Zero Cross:</b> {String(reading.zeroCross)}</div>
            <div><b>Snapshots:</b> {reading.instruments.map((i) => i.snapshotId).join(" | ")}</div>
            <div><b>Warnings:</b> {reading.warnings.length === 0 ? "none" : reading.warnings.join("; ")}</div>
            <div><b>Provider Meta:</b> <code style={{ fontSize: 11 }}>{JSON.stringify(result?.ok ? (result as { providerMeta: unknown }).providerMeta : {})}</code></div>
          </div>
        )}
      </div>

      {/* Persistent history + shadow validation */}
      {(persisted.length > 0 || shadowSamples.length > 0) && (
        <div style={{
          marginTop: 16, border: "1px solid var(--eb-line)",
          borderRadius: 10, padding: 12, fontSize: 12,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            History (persistent): {persisted.length} points · Shadow observations:{" "}
            {summarizeShadowObservations(shadowSamples).length}
          </div>
          <div style={{ opacity: 0.7 }}>
            Persistent storage retains up to {historyRef.current?.capacity ?? 500} readings across
            reloads. Shadow validation is research-only — no BUY / SELL emitted.
          </div>
          <button
            style={{ ...buttonStyle, marginTop: 8 }}
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

const labelStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column", fontSize: 11, gap: 4, opacity: 0.85,
};
const selectStyle: React.CSSProperties = {
  background: "var(--eb-tint-strong)",
  border: "1px solid var(--eb-divider)",
  color: "inherit", padding: "5px 8px", borderRadius: 6, fontSize: 12,
};
const buttonStyle: React.CSSProperties = {
  background: "var(--eb-warn-bg)",
  border: "1px solid var(--eb-warn-border)",
  color: "var(--eb-warn-fg)", padding: "6px 12px", borderRadius: 6,
  fontSize: 12, fontWeight: 600, cursor: "pointer",
};
const cell: React.CSSProperties = { padding: "6px 10px" };

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      padding: "8px 10px", borderRadius: 8,
      border: "1px solid var(--eb-hairline)",
      background: "var(--eb-tint-soft)",
    }}>
      <div style={{ fontSize: 10, letterSpacing: 0.4, opacity: 0.6, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 600, marginTop: 2 }}>{value}</div>
    </div>
  );
}