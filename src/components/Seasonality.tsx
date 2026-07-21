import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getSeasonality } from "@/lib/seasonality.functions";
import { useMemo, useState } from "react";
import {
  computeIntelligence,
  biasColor,
  biasLabel,
  aiInsight,
  tradeSuggestions,
  toCsv,
  MONTH_SHORT,
  type MonthlyStats,
  type SeasonalityIntelligence,
} from "@/lib/seasonality/analytics";

export const seasonalityQuery = () =>
  queryOptions({
    queryKey: ["seasonality"],
    queryFn: () => getSeasonality(),
    refetchInterval: 30 * 60_000,
    refetchOnWindowFocus: false,
  });

/** 5-band bias from a % value. */
function bandFor(v: number | null): "EXTREME_BULLISH" | "BULLISH" | "NEUTRAL" | "BEARISH" | "EXTREME_BEARISH" {
  if (v == null) return "NEUTRAL";
  if (v >= 4) return "EXTREME_BULLISH";
  if (v >= 1) return "BULLISH";
  if (v <= -4) return "EXTREME_BEARISH";
  if (v <= -1) return "BEARISH";
  return "NEUTRAL";
}

function Cell({
  v,
  bold,
  highlight,
  title,
  onClick,
}: {
  v: number | null;
  bold?: boolean;
  highlight?: boolean;
  title?: string;
  onClick?: () => void;
}) {
  const { bg, fg } = v == null
    ? { bg: "transparent", fg: "var(--eb-muted)" }
    : biasColor(bandFor(v));
  return (
    <td
      title={title}
      onClick={onClick}
      style={{
        padding: "6px 8px",
        textAlign: "center",
        fontFamily: "var(--eb-mono)",
        fontSize: 11.5,
        fontWeight: bold ? 700 : 600,
        background: bg,
        color: fg,
        whiteSpace: "nowrap",
        minWidth: 46,
        cursor: onClick ? "pointer" : "default",
        outline: highlight ? "2px solid var(--eb-accent)" : "none",
        outlineOffset: -2,
      }}
    >
      {v == null ? "—" : v.toFixed(1)}
    </td>
  );
}

const yearCellStyle: React.CSSProperties = {
  padding: "6px 10px",
  textAlign: "left",
  fontFamily: "var(--eb-mono)",
  fontSize: 11.5,
  fontWeight: 700,
  color: "var(--eb-text)",
  position: "sticky",
  left: 0,
  background: "var(--eb-card)",
  zIndex: 1,
  whiteSpace: "nowrap",
};

function fmtPct(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(digits)}%`;
}

function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "bull" | "bear" | "neutral" | "accent";
}) {
  const color =
    tone === "bull" ? "var(--eb-bull)" :
    tone === "bear" ? "var(--eb-bear)" :
    tone === "accent" ? "var(--eb-accent)" : "var(--eb-text)";
  return (
    <div
      style={{
        background: "color-mix(in srgb, var(--eb-card) 96%, transparent)",
        border: "1px solid var(--eb-border)",
        borderRadius: 8,
        padding: "10px 12px",
        minWidth: 130,
        flex: "1 1 130px",
      }}
    >
      <div style={{ fontSize: 10, letterSpacing: 0.6, color: "var(--eb-muted)", textTransform: "uppercase", fontFamily: "var(--eb-mono)" }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--eb-mono)", color, marginTop: 4 }}>
        {value}
      </div>
      {hint ? (
        <div style={{ fontSize: 10, color: "var(--eb-muted)", marginTop: 2, fontFamily: "var(--eb-mono)" }}>{hint}</div>
      ) : null}
    </div>
  );
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div style={{ background: "color-mix(in srgb, var(--eb-muted) 15%, transparent)", height: 6, borderRadius: 3, overflow: "hidden" }}>
      <div style={{ width: `${w}%`, background: color, height: "100%" }} />
    </div>
  );
}

function MonthDetail({ m, intel }: { m: MonthlyStats; intel: SeasonalityIntelligence }) {
  const rows: [string, string][] = [
    ["Average Return", fmtPct(m.average)],
    ["Median Return", fmtPct(m.median)],
    ["Positive Years", `${m.positive}`],
    ["Negative Years", `${m.negative}`],
    ["Best Year", m.bestYear ? `${m.bestYear} · ${fmtPct(m.best)}` : "—"],
    ["Worst Year", m.worstYear ? `${m.worstYear} · ${fmtPct(m.worst)}` : "—"],
    ["Maximum Gain", fmtPct(m.maxGain)],
    ["Maximum Loss", fmtPct(m.maxLoss)],
    ["Standard Deviation", m.stdev == null ? "—" : m.stdev.toFixed(2)],
    ["Consistency Score", `${Math.round(m.consistency * 100)}%`],
    ["Prob. Positive Close", `${Math.round(m.probPositive * 100)}%`],
    ["Prob. Negative Close", `${Math.round(m.probNegative * 100)}%`],
    ["Historical Rank", `${m.historicalRank} / 12`],
    ["Seasonality Score", `${m.score} · ${m.strength}`],
  ];
  const suggestions = tradeSuggestions(m);
  return (
    <div
      style={{
        borderTop: "1px solid var(--eb-border)",
        padding: "12px 14px",
        background: "color-mix(in srgb, var(--eb-card) 92%, transparent)",
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
        gap: 16,
      }}
    >
      <div>
        <div style={{ fontSize: 12, fontFamily: "var(--eb-head)", letterSpacing: 1.4, color: "var(--eb-accent)", marginBottom: 8 }}>
          {m.monthName} · Monthly Intelligence
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px" }}>
          {rows.map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, fontFamily: "var(--eb-mono)", color: "var(--eb-text)" }}>
              <span style={{ color: "var(--eb-muted)" }}>{k}</span>
              <span style={{ fontWeight: 700 }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div style={{ fontSize: 12, fontFamily: "var(--eb-head)", letterSpacing: 1.4, color: "var(--eb-accent)", marginBottom: 8 }}>
          Winning Probability
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <ProbRow label="Positive" pct={m.winRate * 100} color="var(--eb-bull)" />
          <ProbRow label="Negative" pct={m.lossRate * 100} color="var(--eb-bear)" />
          <ProbRow label="Flat" pct={m.flatRate * 100} color="var(--eb-muted)" />
          <ProbRow label="Consistency" pct={m.consistency * 100} color="var(--eb-accent)" />
        </div>
        <div style={{ fontSize: 12, fontFamily: "var(--eb-head)", letterSpacing: 1.4, color: "var(--eb-accent)", margin: "14px 0 8px" }}>
          Trade Research (Not Signals)
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {suggestions.map((s) => (
            <span key={s} style={{
              fontSize: 10.5,
              fontFamily: "var(--eb-mono)",
              padding: "3px 8px",
              borderRadius: 999,
              border: "1px solid var(--eb-border)",
              color: "var(--eb-text)",
              background: "color-mix(in srgb, var(--eb-accent) 6%, transparent)",
            }}>{s}</span>
          ))}
        </div>
      </div>
      <div style={{ gridColumn: "1 / -1", fontSize: 11, color: "var(--eb-muted)", fontFamily: "var(--eb-mono)", borderTop: "1px dashed var(--eb-border)", paddingTop: 8 }}>
        {aiInsightForMonth(m, intel)}
      </div>
    </div>
  );
}

function aiInsightForMonth(m: MonthlyStats, intel: SeasonalityIntelligence): string {
  if (m.monthIndex === intel.currentMonthIndex) return aiInsight(intel);
  const avg = m.average ?? 0;
  const dir = avg > 0.5 ? "positive" : avg < -0.5 ? "negative" : "flat";
  return `${m.monthName} historically shows ${dir} average returns (${avg.toFixed(2)}%) with a ${Math.round(m.winRate * 100)}% win rate over ${m.count} years. Seasonal bias: ${biasLabel(m.bias)}. Research only — not a trading signal.`;
}

function ProbRow({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, fontFamily: "var(--eb-mono)", color: "var(--eb-muted)" }}>
        <span>{label}</span><span style={{ color: "var(--eb-text)", fontWeight: 700 }}>{pct.toFixed(0)}%</span>
      </div>
      <ProgressBar pct={pct} color={color} />
    </div>
  );
}

export function Seasonality() {
  const { data, isFetching } = useSuspenseQuery(seasonalityQuery());
  const intel = useMemo(() => computeIntelligence(data), [data]);
  const [selected, setSelected] = useState<number | null>(null);
  const currentIdx = intel.currentMonthIndex;
  const cm = intel.currentMonth;

  const handleExportCsv = () => {
    if (typeof window === "undefined") return;
    const csv = toCsv(data, intel);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nifty50-seasonality-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section
      aria-label="Nifty 50 seasonality intelligence"
      style={{
        marginTop: 18,
        background: "var(--eb-card)",
        border: "1px solid var(--eb-border)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid var(--eb-border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          background:
            "linear-gradient(90deg, color-mix(in srgb, var(--eb-accent) 12%, transparent), transparent 60%)",
        }}
      >
        <span
          style={{
            fontFamily: "var(--eb-head)",
            fontSize: 15,
            letterSpacing: 2,
            color: "var(--eb-accent)",
          }}
        >
          📅 NIFTY 50 SEASONALITY · INTELLIGENCE DASHBOARD
        </span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            onClick={handleExportCsv}
            style={{
              fontSize: 10.5,
              fontFamily: "var(--eb-mono)",
              letterSpacing: 0.6,
              padding: "4px 10px",
              border: "1px solid var(--eb-border)",
              borderRadius: 4,
              background: "transparent",
              color: "var(--eb-text)",
              cursor: "pointer",
            }}
            aria-label="Export seasonality data as CSV"
          >
            ⬇ CSV
          </button>
          <span
            suppressHydrationWarning
            style={{
              fontSize: 10,
              fontFamily: "var(--eb-mono)",
              color: isFetching ? "var(--eb-accent)" : "var(--eb-muted)",
              letterSpacing: 0.6,
            }}
          >
            {isFetching ? "↻ updating…" : "open → close %"}
          </span>
        </div>
      </div>

      {/* Summary cards */}
      {data.years.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, padding: 14, borderBottom: "1px solid var(--eb-border)" }}>
          <StatCard label="Best Month" value={intel.bestMonth?.monthName ?? "—"} hint={fmtPct(intel.bestMonth?.average)} tone="bull" />
          <StatCard label="Worst Month" value={intel.worstMonth?.monthName ?? "—"} hint={fmtPct(intel.worstMonth?.average)} tone="bear" />
          <StatCard label="Current Month" value={cm?.monthName ?? "—"} hint={cm ? biasLabel(cm.bias) : undefined} tone="accent" />
          <StatCard label="Current Avg Return" value={fmtPct(cm?.average)} hint={cm ? `${Math.round(cm.winRate * 100)}% win rate` : undefined} tone={cm && (cm.average ?? 0) >= 0 ? "bull" : "bear"} />
          <StatCard label="Positive Years" value={`${intel.positiveYears}`} />
          <StatCard label="Negative Years" value={`${intel.negativeYears}`} />
          <StatCard label="Overall Win Rate" value={intel.overallWinRate == null ? "—" : `${Math.round(intel.overallWinRate * 100)}%`} />
          <StatCard label="Avg Monthly Return" value={fmtPct(intel.averageMonthlyReturn)} />
          <StatCard label="Median Monthly Return" value={fmtPct(intel.medianMonthlyReturn)} />
          <StatCard label="Volatility (σ)" value={intel.volatilityScore == null ? "—" : intel.volatilityScore.toFixed(2)} />
        </div>
      )}

      {/* Current month insight strip */}
      {cm && cm.count > 0 && (
        <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--eb-border)", fontSize: 11.5, fontFamily: "var(--eb-mono)", color: "var(--eb-text)", display: "flex", flexWrap: "wrap", gap: 16 }}>
          <span><span style={{ color: "var(--eb-muted)" }}>Bias:</span> <b>{biasLabel(cm.bias)}</b></span>
          <span><span style={{ color: "var(--eb-muted)" }}>Avg:</span> <b>{fmtPct(cm.average)}</b></span>
          <span><span style={{ color: "var(--eb-muted)" }}>Win Rate:</span> <b>{Math.round(cm.winRate * 100)}%</b></span>
          <span><span style={{ color: "var(--eb-muted)" }}>Score:</span> <b>{cm.score} · {cm.strength}</b></span>
          <span style={{ color: "var(--eb-muted)" }}>{aiInsight(intel)}</span>
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        {data.years.length === 0 ? (
          <div
            style={{
              padding: 16,
              fontSize: 12,
              color: "var(--eb-muted)",
              fontFamily: "var(--eb-mono)",
            }}
          >
            Seasonality data unavailable right now.
          </div>
        ) : (
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--eb-border)" }}>
                <th style={{ ...yearCellStyle, color: "var(--eb-accent)", fontSize: 10, letterSpacing: 0.6 }}>
                  YEAR
                </th>
                {MONTH_SHORT.map((m, i) => (
                  <th
                    key={m}
                    onClick={() => setSelected(selected === i ? null : i)}
                    style={{
                      padding: "8px 8px",
                      fontFamily: "var(--eb-mono)",
                      fontSize: 10,
                      letterSpacing: 0.6,
                      fontWeight: 700,
                      color: i === currentIdx ? "var(--eb-bg)" : "var(--eb-accent)",
                      background: i === currentIdx ? "var(--eb-accent)" : "transparent",
                      textAlign: "center",
                      textTransform: "uppercase",
                      cursor: "pointer",
                      outline: selected === i ? "2px solid var(--eb-accent)" : "none",
                      outlineOffset: -2,
                    }}
                    title={`Click to inspect ${m}`}
                  >
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: "2px solid var(--eb-border)" }}>
                <td style={{ ...yearCellStyle, color: "var(--eb-accent)" }}>Avg %</td>
                {intel.monthly.map((m, i) => (
                  <Cell
                    key={i}
                    v={m.average}
                    bold
                    highlight={i === currentIdx || selected === i}
                    onClick={() => setSelected(selected === i ? null : i)}
                    title={`${m.monthName} · Avg ${fmtPct(m.average)} · Win ${Math.round(m.winRate * 100)}% · Score ${m.score}`}
                  />
                ))}
              </tr>
              <tr style={{ borderBottom: "2px solid var(--eb-border)" }}>
                <td style={{ ...yearCellStyle, color: "var(--eb-muted)", fontSize: 10 }}>Score</td>
                {intel.monthly.map((m, i) => (
                  <td key={i} style={{ padding: "6px 8px", textAlign: "center", fontFamily: "var(--eb-mono)", fontSize: 10.5, fontWeight: 700, color: m.score >= 65 ? "var(--eb-bull)" : m.score <= 40 ? "var(--eb-bear)" : "var(--eb-muted)" }}>
                    {m.count ? m.score : "—"}
                  </td>
                ))}
              </tr>
              {data.years.map((row) => (
                <tr key={row.year} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <td style={yearCellStyle}>{row.year}</td>
                  {row.months.map((v, i) => {
                    const c = intel.cell(row.year, i);
                    const tip =
                      v == null
                        ? `${row.year} ${MONTH_SHORT[i]} · no data`
                        : `${row.year} ${MONTH_SHORT[i]} · ${v.toFixed(2)}% · rank ${c.rankInMonth}/${c.totalInMonth}` +
                          (c.zScore != null ? ` · z=${c.zScore.toFixed(2)}` : "") +
                          (c.vsAverage != null ? ` · vs avg ${c.vsAverage >= 0 ? "+" : ""}${c.vsAverage.toFixed(2)}%` : "");
                    return (
                      <Cell
                        key={i}
                        v={v}
                        highlight={i === currentIdx}
                        onClick={() => setSelected(selected === i ? null : i)}
                        title={tip}
                      />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected != null && intel.monthly[selected].count > 0 && (
        <MonthDetail m={intel.monthly[selected]} intel={intel} />
      )}
      <div style={{ padding: "8px 14px", fontSize: 10, color: "var(--eb-muted)", fontFamily: "var(--eb-mono)", borderTop: "1px solid var(--eb-border)" }}>
        Research only — historical seasonality is not a predictor of future returns. Do not trade on seasonality alone.
      </div>
    </section>
  );
}