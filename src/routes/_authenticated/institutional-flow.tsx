// Phase 3D — Institutional Flow Dashboard.
// Read-only, deterministic, canonical-consumer only. Never emits signals.

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getInstitutionalFlow, type InstitutionalFlowResponse } from "@/lib/institutional-flow/institutional-flow.functions";
import type { OptionUnderlying } from "@/lib/option-chain/types";
import { safeProviderLabel } from "@/lib/provider-labels";

export const Route = createFileRoute("/_authenticated/institutional-flow")({
  head: () => ({
    meta: [
      { title: "Institutional Flow — Derivatives Analytics · EagleBABA" },
      { name: "description", content: "Professional derivatives analytics — OI, Max Pain, Gamma, Sector Flow. Research only." },
      { property: "og:title", content: "Institutional Flow — Derivatives Analytics" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InstitutionalFlowPage,
});

function InstitutionalFlowPage() {
  const [underlying, setUnderlying] = useState<OptionUnderlying>("NIFTY");
  const [report, setReport] = useState<InstitutionalFlowResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchFlow = useServerFn(getInstitutionalFlow);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetchFlow({ data: { underlying } });
      setReport(r);
    } catch (e) {
      setError(e instanceof Error ? e.message.slice(0, 200) : "load failed");
    } finally { setLoading(false); }
  }, [fetchFlow, underlying]);

  useEffect(() => { void load(); }, [load]);

  const providerAlias = safeProviderLabel(null, "OPTIONS");
  const spot = report?.spot ?? null;
  const bias = report?.summary?.bias ?? "UNAVAILABLE";

  return (
    <div className="eb-page eb-content" style={{ maxWidth: 1240, margin: "0 auto", padding: "20px 16px" }}>
      <header style={{ marginBottom: 16 }}>
        <div style={label}>DERIVATIVES · INSTITUTIONAL FLOW</div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Institutional Flow Dashboard</h1>
        <p style={{ margin: "6px 0 0", opacity: 0.7, fontSize: 13 }}>
          Read-only derivatives analytics. Consumes canonical Option Chain, Combined PCR, Market Breadth,
          Decision and GTI. Never issues trade signals or orders.
        </p>
      </header>

      <div style={toolbar}>
        <label style={{ fontSize: 12 }}>Underlying
          <select value={underlying} onChange={(e) => setUnderlying(e.target.value as OptionUnderlying)} style={selectStyle}>
            <option value="NIFTY">NIFTY</option>
            <option value="BANKNIFTY">BANKNIFTY</option>
          </select>
        </label>
        <button onClick={load} disabled={loading} style={btnPrimary}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
        <span style={{ fontSize: 11, opacity: 0.6 }}>
          {report ? `Generated ${new Date(report.generatedAt).toLocaleTimeString()} · ${providerAlias}` : ""}
        </span>
      </div>

      {error && <div style={errorBox}>Institutional Flow error: {error}</div>}

      {report && (
        <>
          <div style={cardsGrid}>
            <Card label="Spot" value={spot ?? "—"} />
            <Card label="ATM Strike" value={report.oi.atmStrike ?? "—"} />
            <Card label="Max Pain" value={report.maxPain.currentMaxPain ?? "—"} />
            <Card label="Gamma Wall" value={report.gamma.gammaWallStrike ?? "—"} />
            <Card label="Gamma Flip" value={report.gamma.gammaFlipStrike ?? "—"} />
            <Card label="Highest Call OI" value={report.oi.highestCallOiStrike ?? "—"} />
            <Card label="Highest Put OI" value={report.oi.highestPutOiStrike ?? "—"} />
            <Card label="Positioning" value={bias.replace(/_/g, " ")} />
          </div>

          <Section title="Executive Summary">
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{report.summary.headline}</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.55 }}>
              {report.summary.rationale.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
            <div style={{ marginTop: 8, fontSize: 11, opacity: 0.65 }}>
              Evidence: {report.summary.evidence.join(" · ") || "—"}
            </div>
          </Section>

          <Section title="Build-Up Analysis">
            <div style={grid2}>
              <MiniStat label="Call side" value={report.buildUp.callSide.replace(/_/g, " ")} />
              <MiniStat label="Put side" value={report.buildUp.putSide.replace(/_/g, " ")} />
              <MiniStat label="Overall" value={report.buildUp.overall.replace(/_/g, " ")} />
              <MiniStat label="Underlying Δ" value={fmt(report.buildUp.underlyingPriceChange)} />
              <MiniStat label="ΣΔCall OI" value={fmt(report.buildUp.totalCallChangeOi)} />
              <MiniStat label="ΣΔPut OI" value={fmt(report.buildUp.totalPutChangeOi)} />
            </div>
            <p style={{ margin: "8px 0 0", fontSize: 11, opacity: 0.7 }}>{report.buildUp.rationale}</p>
          </Section>

          <Section title="Max Pain">
            <div style={grid2}>
              <MiniStat label="Current" value={report.maxPain.currentMaxPain ?? "—"} />
              <MiniStat label="Nearest strike" value={report.maxPain.nearestMaxPain ?? "—"} />
              <MiniStat label="Δ from spot" value={fmt(report.maxPain.distanceFromSpot)} />
              <MiniStat label="Δ from spot %" value={report.maxPain.distanceFromSpotPct == null ? "—" : `${report.maxPain.distanceFromSpotPct.toFixed(2)}%`} />
            </div>
          </Section>

          <Section title="Gamma">
            <div style={grid2}>
              <MiniStat label="Exposure" value={fmt(report.gamma.gammaExposure)} />
              <MiniStat label="Positive Γ" value={fmt(report.gamma.positiveGamma)} />
              <MiniStat label="Negative Γ" value={fmt(report.gamma.negativeGamma)} />
              <MiniStat label="Wall" value={report.gamma.gammaWallStrike ?? "—"} />
              <MiniStat label="Flip" value={report.gamma.gammaFlipStrike ?? "—"} />
              <MiniStat label="Availability" value={report.gamma.availability} />
            </div>
            <p style={{ margin: "8px 0 0", fontSize: 11, opacity: 0.7 }}>{report.gamma.reason}</p>
          </Section>

          <Section title="Sector Flow">
            <div style={{ overflowX: "auto" }}>
              <table style={tbl}>
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.04)" }}>
                    <Th>Sector</Th><Th>Advances</Th><Th>Declines</Th><Th>Net</Th><Th>Weighted</Th><Th>Bias</Th>
                  </tr>
                </thead>
                <tbody>
                  {report.sectorFlow.rows.map((r) => (
                    <tr key={r.id}>
                      <Td>{r.name}</Td>
                      <Td>{r.advances ?? "—"}</Td>
                      <Td>{r.declines ?? "—"}</Td>
                      <Td>{fmt(r.netBreadth)}</Td>
                      <Td>{fmt(r.weightedBreadth)}</Td>
                      <Td><span style={biasStyle(r.bias)}>{r.bias}</span></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Market Internals">
            <div style={grid2}>
              <MiniStat label="Advances" value={report.internals.advances ?? "—"} />
              <MiniStat label="Declines" value={report.internals.declines ?? "—"} />
              <MiniStat label="A/D ratio" value={fmt(report.internals.advanceDeclineRatio)} />
              <MiniStat label="PCR" value={fmt(report.internals.pcr)} />
              <MiniStat label="PCR state" value={report.internals.pcrState} />
              <MiniStat label="VIX" value={fmt(report.internals.vix)} />
              <MiniStat label="Decision" value={report.internals.decisionAction} />
              <MiniStat label="GTI" value={`${report.internals.gtiState} (${Math.round(report.internals.gtiConfidence * 100)}%)`} />
            </div>
          </Section>

          <Section title="OI Heatmap">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(84px, 1fr))", gap: 4 }}>
              {report.heatmap.cells.map((c) => (
                <div key={c.strike} title={`Strike ${c.strike} · OI ${c.totalOi ?? "—"}`}
                  style={{
                    padding: "8px 6px", borderRadius: 6, textAlign: "center",
                    background: `rgba(107,211,255,${(c.intensity * 0.6).toFixed(2)})`,
                    border: c.isAtm ? "1px solid #6bd3ff" : c.isMaxPain ? "1px dashed #ffcf6b" : "1px solid rgba(255,255,255,0.05)",
                    fontSize: 11,
                  }}>
                  <div style={{ fontWeight: 600 }}>{c.strike}</div>
                  <div style={{ opacity: 0.75 }}>{fmt(c.totalOi)}</div>
                </div>
              ))}
            </div>
          </Section>

          <Section title="OI Analysis (per-strike)">
            <div style={{ overflowX: "auto" }}>
              <table style={tbl}>
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.04)" }}>
                    <Th>Call OI</Th><Th>Call ΔOI</Th><Th center>Strike</Th><Th>Put ΔOI</Th><Th>Put OI</Th>
                  </tr>
                </thead>
                <tbody>
                  {report.oi.rows.map((r) => (
                    <tr key={r.strike} style={{ background: r.isAtm ? "rgba(107,211,255,0.09)" : "transparent" }}>
                      <Td>{fmt(r.callOi)}</Td>
                      <Td>{fmt(r.callChangeOi)}</Td>
                      <Td center bold>{r.strike}</Td>
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

function Card({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ padding: 10, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, background: "rgba(255,255,255,0.03)" }}>
      <div style={{ fontSize: 10, opacity: 0.6, letterSpacing: 0.4, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 600, marginTop: 4 }}>{value}</div>
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 18, padding: 14, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, background: "rgba(255,255,255,0.02)" }}>
      <div style={{ fontSize: 11, letterSpacing: 0.6, color: "#6bd3ff", fontWeight: 700, marginBottom: 10 }}>{title.toUpperCase()}</div>
      {children}
    </section>
  );
}
function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ padding: 8, background: "rgba(0,0,0,0.25)", borderRadius: 8 }}>
      <div style={{ fontSize: 10, opacity: 0.6, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{value}</div>
    </div>
  );
}
function Th({ children, center }: { children: React.ReactNode; center?: boolean }) {
  return <th style={{ padding: "8px 10px", textAlign: center ? "center" : "right", fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>{children}</th>;
}
function Td({ children, center, bold }: { children: React.ReactNode; center?: boolean; bold?: boolean }) {
  return <td style={{ padding: "6px 10px", textAlign: center ? "center" : "right", fontWeight: bold ? 700 : 400, borderBottom: "1px solid rgba(255,255,255,0.04)" }}>{children}</td>;
}
function fmt(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (Math.abs(v) >= 100_000) return `${(v / 1000).toFixed(0)}k`;
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}
function biasStyle(b: string): React.CSSProperties {
  const color = b === "BULLISH" ? "#6bffb0" : b === "BEARISH" ? "#ff8a8a" : b === "NEUTRAL" ? "#e6f1f7" : "#888";
  return { color, fontWeight: 600, fontSize: 12 };
}

const label: React.CSSProperties = { fontSize: 11, letterSpacing: 0.6, fontWeight: 700, color: "#6bd3ff", marginBottom: 6 };
const toolbar: React.CSSProperties = { display: "flex", gap: 10, alignItems: "flex-end", padding: 12, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, background: "rgba(255,255,255,0.03)", marginBottom: 14 };
const selectStyle: React.CSSProperties = { display: "block", marginTop: 4, padding: "6px 10px", background: "#0d1a24", color: "#e6f1f7", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, fontSize: 12 };
const btnPrimary: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "1px solid rgba(107,211,255,0.4)", background: "rgba(107,211,255,0.15)", color: "#cfefff", fontSize: 12, fontWeight: 600, cursor: "pointer" };
const errorBox: React.CSSProperties = { padding: "10px 14px", borderRadius: 8, border: "1px solid rgba(255,120,120,0.35)", background: "rgba(255,120,120,0.08)", color: "#ffb3b3", fontSize: 12, marginBottom: 12 };
const cardsGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginBottom: 14 };
const grid2: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 };
const tbl: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 12 };
const disclaimer: React.CSSProperties = { marginTop: 18, fontSize: 11, opacity: 0.55 };