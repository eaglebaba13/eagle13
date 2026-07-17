// Phase 26 · Stage 5 — Live Option Chain foundation UI.
//
// Read-only. NIFTY & BANKNIFTY only. No signals, no strategy output,
// no broker paths. Uses the OptionChainProvider abstraction; live data
// via Upstox, mock scenarios available in the Research panel.

import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getOptionChain, type GetOptionChainResult } from "@/lib/option-chain/option-chain.functions";
import { classifyExpiries } from "@/lib/option-chain/expiry-engine";
import { computeAtm, type AtmMode } from "@/lib/option-chain/atm-engine";
import { filterStrikes } from "@/lib/option-chain/strike-filter";
import { computeAllMetrics } from "@/lib/option-chain/metrics";
import { snapshotToCsv, snapshotToJson, buildResearchBundle } from "@/lib/option-chain/exports";
import { assessDataQuality } from "@/lib/option-chain/data-quality";
import type { OptionChainSnapshot, OptionUnderlying } from "@/lib/option-chain/types";
import { evaluateOptionChainCapability, type OptionChainCapability } from "@/lib/option-chain/capability";
import { safeProviderLabel } from "@/lib/provider-labels";

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
  if (typeof window === "undefined") return { underlying: "NIFTY", expiry: null, atmMode: "ATM_10" };
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return { underlying: "NIFTY", expiry: null, atmMode: "ATM_10" };
    const p = JSON.parse(raw) as Partial<Persisted>;
    return {
      underlying: p.underlying === "BANKNIFTY" ? "BANKNIFTY" : "NIFTY",
      expiry: typeof p.expiry === "string" ? p.expiry : null,
      atmMode: (p.atmMode as AtmMode) ?? "ATM_10",
    };
  } catch { return { underlying: "NIFTY", expiry: null, atmMode: "ATM_10" }; }
}
function savePersisted(p: Persisted): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

function download(name: string, mime: string, body: string): void {
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function OptionsChainPage() {
  const [state, setState] = useState<Persisted>(() => ({ underlying: "NIFTY", expiry: null, atmMode: "ATM_10" }));
  const [atmMode, setAtmMode] = useState<AtmMode>("ATM_10");
  const [result, setResult] = useState<GetOptionChainResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showResearch, setShowResearch] = useState(false);
  const [mockScenario, setMockScenario] = useState<string>("");

  const fetchChain = useServerFn(getOptionChain);

  useEffect(() => {
    const p = loadPersisted();
    setState(p);
    setAtmMode(p.atmMode);
  }, []);

  const load = useCallback(async (opts: { useMock?: boolean; scenario?: string } = {}) => {
    setLoading(true); setErrorMsg(null);
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
  }, [fetchChain, state.underlying, state.expiry]);

  useEffect(() => { savePersisted({ ...state, atmMode }); }, [state, atmMode]);

  const snapshot: OptionChainSnapshot | null = result?.ok ? result.snapshot : null;
  const expiries = useMemo(() => classifyExpiries(snapshot?.availableExpiries ?? []), [snapshot]);
  const atm = useMemo(() => snapshot ? computeAtm(snapshot.strikes, snapshot.spotPrice, atmMode) : null, [snapshot, atmMode]);
  const filtered = useMemo(() => snapshot ? filterStrikes(snapshot, atmMode) : null, [snapshot, atmMode]);
  const metrics = useMemo(() => filtered ? computeAllMetrics(filtered.included) : [], [filtered]);
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
    <div className="eb-page eb-content" style={{ maxWidth: 1200, margin: "0 auto", padding: "20px 16px" }}>
      <header style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, letterSpacing: 0.6, fontWeight: 700, color: "#6bd3ff", marginBottom: 6 }}>
          MARKET · OPTIONS CHAIN
        </div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Live Option Chain — NIFTY & BANKNIFTY</h1>
        <p style={{ margin: "6px 0 0", opacity: 0.7, fontSize: 13 }}>
          Read-only snapshot foundation. No signals emitted at this stage. Combined PCR, Max Pain
          and OI Build-up will consume this snapshot in later phases.
        </p>
      </header>

      {/* Toolbar */}
      <div style={toolbarStyle}>
        <label style={{ fontSize: 12 }}>
          Underlying
          <select
            value={state.underlying}
            onChange={(e) => setState((s) => ({ ...s, underlying: e.target.value as OptionUnderlying, expiry: null }))}
            style={selectStyle}
          >
            <option value="NIFTY">NIFTY</option>
            <option value="BANKNIFTY">BANKNIFTY</option>
          </select>
        </label>
        <label style={{ fontSize: 12 }}>
          Expiry
          <select
            value={state.expiry ?? ""}
            onChange={(e) => setState((s) => ({ ...s, expiry: e.target.value || null }))}
            style={selectStyle}
          >
            <option value="">— current weekly —</option>
            {expiries.all.map((e) => (
              <option key={e.date} value={e.date}>{e.date} · {e.bucket.replace("_", " ")}</option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 12 }}>
          Strike filter
          <select value={atmMode} onChange={(e) => setAtmMode(e.target.value as AtmMode)} style={selectStyle}>
            <option value="ATM">ATM</option>
            <option value="ATM_5">ATM ± 5</option>
            <option value="ATM_10">ATM ± 10</option>
            <option value="ATM_20">ATM ± 20</option>
          </select>
        </label>
        <button onClick={() => load()} disabled={loading} style={btnPrimary}>
          {loading ? "Loading…" : "Fetch Live"}
        </button>
        <button onClick={() => load({ useMock: true, scenario: mockScenario || "SIDEWAYS" })} disabled={loading} style={btnSecondary}>
          Fetch Mock
        </button>
        {snapshot && (
          <>
            <button onClick={() => download(`option-chain-${snapshot.instrument}-${snapshot.expiry}.csv`, "text/csv", snapshotToCsv(snapshot))} style={btnGhost}>CSV</button>
            <button onClick={() => download(`option-chain-${snapshot.instrument}-${snapshot.expiry}.json`, "application/json", snapshotToJson(snapshot))} style={btnGhost}>JSON</button>
            {quality && (
              <button
                onClick={() => download(`option-chain-bundle-${snapshot.instrument}.json`, "application/json", JSON.stringify(buildResearchBundle(snapshot, quality), null, 2))}
                style={btnGhost}
              >Research Bundle</button>
            )}
          </>
        )}
      </div>

      {capability && showBlocking && (
        <CapabilityCard capability={capability} onRetry={() => load()} onMock={() => load({ useMock: true, scenario: mockScenario || "SIDEWAYS" })} />
      )}
      {capability && !showBlocking && capability.status === "PARTIAL" && (
        <div style={warnBox}>Partial snapshot · {capability.reason}</div>
      )}
      {errorMsg && !capability && (
        <div style={errorBox}>{providerAlias}: {errorMsg}</div>
      )}

      {/* Header cards */}
      {!showBlocking && (
      <div style={cardsGridStyle}>
        <Card label="Spot" value={snapshot?.spotPrice ?? "—"} />
        <Card label="ATM" value={atm?.atm ?? "—"} />
        <Card label="Expiry" value={snapshot?.expiry ?? "—"} />
        <Card label="Total Strikes" value={snapshot?.strikes.length ?? 0} />
        <Card label="Filtered" value={filtered?.included.length ?? 0} />
        <Card label="Provider" value={providerAlias} />
        <Card label="Freshness" value={snapshot?.timestamp ? relativeTime(snapshot.timestamp) : "—"} />
        <Card label="Quality" value={quality?.ok ? "OK" : quality ? `${quality.issues.length} issue(s)` : "—"} />
      </div>
      )}

      {/* Chart */}
      {filtered && filtered.included.length > 0 && (
        <Suspense fallback={<div style={{ padding: 16, opacity: 0.6 }}>Loading chart…</div>}>
          <OptionChainChart strikes={filtered.included} spot={snapshot?.spotPrice ?? null} atm={atm?.atm ?? null} />
        </Suspense>
      )}

      {/* Strike table */}
      {metrics.length > 0 && (
        <div style={{ overflowX: "auto", marginTop: 16, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.04)" }}>
                <Th>Call OI</Th><Th>Call ΔOI</Th><Th>Call Vol</Th><Th>Call IV</Th>
                <Th center>Strike</Th>
                <Th>Put IV</Th><Th>Put Vol</Th><Th>Put ΔOI</Th><Th>Put OI</Th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => {
                const isAtm = m.strike === atm?.atm;
                return (
                  <tr key={m.strike} style={{ background: isAtm ? "rgba(107,211,255,0.09)" : "transparent" }}>
                    <Td>{fmt(m.callOi)}</Td><Td>{fmt(m.callChangeOi)}</Td><Td>{fmt(m.callVolume)}</Td><Td>{fmt(m.callIv)}</Td>
                    <Td center bold>{m.strike}</Td>
                    <Td>{fmt(m.putIv)}</Td><Td>{fmt(m.putVolume)}</Td><Td>{fmt(m.putChangeOi)}</Td><Td>{fmt(m.putOi)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Research panel */}
      <div style={{ marginTop: 20, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }}>
        <button onClick={() => setShowResearch((s) => !s)} style={{ ...btnGhost, width: "100%", textAlign: "left", padding: "10px 14px" }}>
          {showResearch ? "▼" : "▶"} Research Panel {snapshot ? `(${snapshot.strikes.length} strikes)` : ""}
        </button>
        {showResearch && (
          <div style={{ padding: 14, fontSize: 12, lineHeight: 1.55 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10 }}>
              <label>Mock scenario
                <select value={mockScenario} onChange={(e) => setMockScenario(e.target.value)} style={selectStyle}>
                  {["", "BULLISH", "BEARISH", "SIDEWAYS", "MISSING_EXPIRY", "MISSING_STRIKES", "STALE", "PROVIDER_FAILURE", "PAUSED"].map((s) => (
                    <option key={s} value={s}>{s || "(default)"}</option>
                  ))}
                </select>
              </label>
            </div>
            <ResearchBlock title="Provider meta" data={result?.meta} />
            <ResearchBlock title="Data quality" data={snapshot ? assessDataQuality(snapshot) : quality} />
            <ResearchBlock title="Expiry selection" data={expiries} />
            <ResearchBlock title="ATM engine" data={atm} />
            <ResearchBlock title="Included strikes" data={filtered?.included.map((s) => s.strike) ?? []} />
            <ResearchBlock title="Excluded strikes" data={filtered?.excluded.map((s) => s.strike) ?? []} />
            <ResearchBlock title="Normalized snapshot" data={snapshot} />
          </div>
        )}
      </div>

      <p style={{ marginTop: 20, fontSize: 11, opacity: 0.5 }}>
        Foundation only. No CE/PE signals, no Decision Engine wiring, no order paths.
      </p>
    </div>
  );
}

const toolbarStyle: React.CSSProperties = {
  display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end",
  padding: 12, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, background: "rgba(255,255,255,0.03)",
  marginBottom: 14,
};
const selectStyle: React.CSSProperties = { display: "block", marginTop: 4, padding: "6px 10px", background: "#0d1a24", color: "#e6f1f7", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, fontSize: 12 };
const btnPrimary: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "1px solid rgba(107,211,255,0.4)", background: "rgba(107,211,255,0.15)", color: "#cfefff", fontSize: 12, fontWeight: 600, cursor: "pointer" };
const btnSecondary: React.CSSProperties = { ...btnPrimary, background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.16)", color: "#e6f1f7" };
const btnGhost: React.CSSProperties = { ...btnSecondary, background: "transparent" };
const errorBox: React.CSSProperties = { padding: "10px 14px", borderRadius: 8, border: "1px solid rgba(255,120,120,0.35)", background: "rgba(255,120,120,0.08)", color: "#ffb3b3", fontSize: 12, marginBottom: 12 };
const warnBox: React.CSSProperties = { padding: "10px 14px", borderRadius: 8, border: "1px solid rgba(255,200,110,0.35)", background: "rgba(255,200,110,0.08)", color: "#ffd28a", fontSize: 12, marginBottom: 12 };
const cardsGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginBottom: 14 };

function Card({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ padding: 10, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, background: "rgba(255,255,255,0.03)" }}>
      <div style={{ fontSize: 10, opacity: 0.6, letterSpacing: 0.4, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 600, marginTop: 4 }}>{value}</div>
    </div>
  );
}
function Th({ children, center }: { children: React.ReactNode; center?: boolean }) {
  return <th style={{ padding: "8px 10px", textAlign: center ? "center" : "right", fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>{children}</th>;
}
function Td({ children, center, bold }: { children: React.ReactNode; center?: boolean; bold?: boolean }) {
  return <td style={{ padding: "6px 10px", textAlign: center ? "center" : "right", fontWeight: bold ? 700 : 400, borderBottom: "1px solid rgba(255,255,255,0.04)" }}>{children}</td>;
}
function ResearchBlock({ title, data }: { title: string; data: unknown }) {
  return (
    <details style={{ marginBottom: 8 }}>
      <summary style={{ cursor: "pointer", opacity: 0.85 }}>{title}</summary>
      <pre style={{ margin: "6px 0 0", padding: 10, background: "rgba(0,0,0,0.35)", borderRadius: 8, overflowX: "auto", fontSize: 11 }}>
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
function CapabilityCard({ capability, onRetry, onMock }: { capability: OptionChainCapability; onRetry: () => void; onMock: () => void }) {
  return (
    <div style={{ marginBottom: 14, padding: 14, borderRadius: 12, border: "1px solid rgba(255,180,120,0.35)", background: "rgba(255,180,120,0.06)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 0.6, color: "#ffb27a", fontWeight: 700 }}>OPTION CHAIN · {capability.status.replace(/_/g, " ")}</div>
          <div style={{ marginTop: 6, fontSize: 14, fontWeight: 600 }}>{capability.reason}</div>
          {capability.suggestedAction && (
            <div style={{ marginTop: 4, fontSize: 12, opacity: 0.85 }}>Next: {capability.suggestedAction}</div>
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
        {capability.retryable && <button onClick={onRetry} style={btnPrimary}>Retry</button>}
        <button onClick={onMock} style={btnSecondary}>Load Demo Snapshot</button>
      </div>
    </div>
  );
}
function relativeTime(iso: string): string {
  const t = Date.parse(iso); if (!Number.isFinite(t)) return "—";
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return new Date(t).toLocaleString();
}