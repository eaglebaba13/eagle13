import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Orbit,
  Radio,
  Activity,
  Target,
  ShieldCheck,
  ShieldAlert,
  TrendingUp,
  TrendingDown,
  Clock,
  Bell,
  BellOff,
  Download,
  RefreshCw,
  Sun,
  Moon,
  Zap,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Layers,
} from "lucide-react";

import { getHTGannIntra, type HTGannIntraPayload } from "@/lib/ht-gann-intra.functions";
import { getAstro, type AstroData } from "@/lib/astro.functions";
import { useMarketSession } from "@/hooks/use-market-session";
import { fmt, inrRound } from "@/lib/format";
import { useIstClock } from "@/hooks/use-scheduler";

type WindowWithWebkitAudio = Window & { webkitAudioContext?: typeof AudioContext };

export const Route = createFileRoute("/astro")({
  validateSearch: (search: Record<string, unknown>): { tab?: string } => ({
    tab: typeof search.tab === "string" ? search.tab : undefined,
  }),
  component: AstroWorkstationPage,
});

type AstroTab = "matrix" | "radar" | "cube" | "sessions";

function AstroWorkstationPage() {
  const [activeTab, setActiveTab] = useState<AstroTab>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const t = params.get("tab");
      if (t === "radar" || t === "cube" || t === "sessions") return t;
    }
    return "matrix";
  });

  const setTab = (t: AstroTab) => {
    setActiveTab(t);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", t);
      window.history.replaceState({}, "", url.toString());
    }
  };

  const [symbol, setSymbol] = useState<"NIFTY" | "BANKNIFTY">("NIFTY");
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const d = new Date(Date.now() + 19800 * 1000);
    return d.toISOString().slice(0, 10);
  });
  const [customPrevClose, setCustomPrevClose] = useState<string>("");
  const [audioEnabled, setAudioEnabled] = useState<boolean>(true);
  const [lastChimeLevel, setLastChimeLevel] = useState<number | null>(null);

  const parsedCustomClose = customPrevClose.trim() ? Number(customPrevClose) : undefined;

  // Primary Query: Authentic HT Gann Intra V2 & 4-Pillar Cube Engine
  const intraQ = useQuery({
    queryKey: ["ht-gann-intra", symbol, selectedDate, parsedCustomClose],
    queryFn: () =>
      getHTGannIntra({
        data: {
          symbol,
          date: selectedDate,
          customPrevClose: Number.isFinite(parsedCustomClose) ? parsedCustomClose : undefined,
        },
      }),
    refetchInterval: 15_000,
  });

  // Secondary Query: Global Astro Ephemeris & Moon Cycles
  const astroQ = useQuery({
    queryKey: ["astro-base"],
    queryFn: () => getAstro(),
    refetchInterval: 30_000,
  });

  const session = useMarketSession();
  const istClock = useIstClock();

  const data = intraQ.data;
  const astro = astroQ.data;

  // Web Audio Chime Generator
  const playChime = (freq = 880, duration = 180) => {
    if (!audioEnabled || typeof window === "undefined") return;
    try {
      const AC = window.AudioContext || (window as WindowWithWebkitAudio).webkitAudioContext;
      if (AC) {
        const ctx = new AC();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(0.06, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration / 1000);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        setTimeout(() => {
          try {
            osc.stop();
            ctx.close();
          } catch {}
        }, duration + 50);
      }
    } catch {
      /* ignore audio context restrictions */
    }
  };

  // Check proximity for Audio Alerts in Radar mode
  useEffect(() => {
    if (!data || !audioEnabled) return;
    const live = data.livePrice;
    const touched = data.intraMatrix.allLevelsSorted.find(
      (l) => Math.abs(l.level - live) <= (symbol === "BANKNIFTY" ? 10 : 3),
    );
    if (touched && touched.level !== lastChimeLevel) {
      setLastChimeLevel(touched.level);
      playChime(1046.5, 300); // High C chime on touch
    }
  }, [data, audioEnabled, lastChimeLevel, symbol]);

  // Export Matrix to CSV
  const exportCsv = () => {
    if (!data) return;
    const headers = [
      "Planet",
      "AbsDegree",
      "L1_UpperPlus",
      "L1_Safety",
      "L2_LowerPlus",
      "L2_Safety",
      "L3_UpperMinus",
      "L3_Safety",
      "L4_LowerMinus",
      "L4_Safety",
    ];
    const rows = data.intraMatrix.rows.map((r) => [
      r.planet,
      r.absDegree,
      r.L1.level,
      r.L1.safety,
      r.L2.level,
      r.L2.safety,
      r.L3.level,
      r.L3.safety,
      r.L4.level,
      r.L4.safety,
    ]);
    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `ht_gann_intra_${symbol}_${selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ padding: "20px 24px", maxWidth: 1600, margin: "0 auto", color: "var(--text-primary)" }}>
      {/* HEADER BAR */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 20,
          borderBottom: "1px solid var(--eb-border, rgba(255,255,255,0.08))",
          paddingBottom: 16,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: "linear-gradient(135deg, rgba(245,158,11,0.2), rgba(245,158,11,0.05))",
                border: "1px solid rgba(245,158,11,0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--brand-primary, #f59e0b)",
              }}
            >
              <Orbit size={22} />
            </div>
            <div>
              <h1
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  margin: 0,
                  letterSpacing: -0.5,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                Astro Levels & 4-Pillar Cube Workstation
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: 4,
                    background: "rgba(245,158,11,0.15)",
                    color: "var(--brand-primary, #f59e0b)",
                    border: "1px solid rgba(245,158,11,0.3)",
                    letterSpacing: 0.5,
                  }}
                >
                  HT GANN INTRA V2
                </span>
              </h1>
              <p style={{ margin: "2px 0 0 0", fontSize: 12, color: "var(--text-muted, #9ca3af)" }}>
                Harmonics Traders Gann Intra V2 (HTGANNIntraV2.xlsx) · Starwise Nakshatra · Retrograde EMA 13 · 18 Empirical Aspects
              </p>
            </div>
          </div>
        </div>

        {/* Master Cube Verdict Pill in Header */}
        {data && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 14px",
              borderRadius: 8,
              background: data.masterCube.isMasterCubeActive
                ? data.masterCube.positionalDirection === "BULLISH"
                  ? "rgba(0, 201, 122, 0.12)"
                  : "rgba(255, 58, 92, 0.12)"
                : "rgba(255,255,255,0.04)",
              border: data.masterCube.isMasterCubeActive
                ? data.masterCube.positionalDirection === "BULLISH"
                  ? "1px solid rgba(0, 201, 122, 0.4)"
                  : "1px solid rgba(255, 58, 92, 0.4)"
                : "1px solid var(--eb-border, rgba(255,255,255,0.1))",
            }}
          >
            <Zap
              size={18}
              style={{
                color: data.masterCube.isMasterCubeActive
                  ? data.masterCube.positionalDirection === "BULLISH"
                    ? "var(--eb-bull, #00c97a)"
                    : "var(--eb-bear, #ff3a5c)"
                  : "var(--text-muted, #9ca3af)",
              }}
            />
            <div>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8, color: "var(--text-muted)" }}>
                Master Cube Verdict (3/4 Rule)
              </div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: data.masterCube.isMasterCubeActive
                    ? data.masterCube.positionalDirection === "BULLISH"
                      ? "var(--eb-bull, #00c97a)"
                      : "var(--eb-bear, #ff3a5c)"
                    : "inherit",
                }}
              >
                {data.masterCube.verdictBadge}
                {data.masterCube.expiryBadge && (
                  <span
                    style={{
                      marginLeft: 8,
                      padding: "1px 6px",
                      borderRadius: 4,
                      background: "rgba(245,158,11,0.2)",
                      color: "#f59e0b",
                      fontSize: 10,
                    }}
                  >
                    {data.masterCube.expiryBadge}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* WORKSTATION CONTROLS BAR */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "12px 16px",
          background: "var(--surface-card, rgba(255,255,255,0.02))",
          border: "1px solid var(--eb-border, rgba(255,255,255,0.08))",
          borderRadius: 8,
          marginBottom: 18,
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
          {/* Symbol Switcher */}
          <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: "1px solid var(--eb-border, rgba(255,255,255,0.15))" }}>
            <button
              onClick={() => setSymbol("NIFTY")}
              style={{
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: 700,
                background: symbol === "NIFTY" ? "var(--brand-primary, #f59e0b)" : "transparent",
                color: symbol === "NIFTY" ? "#000" : "var(--text-primary)",
                border: "none",
                cursor: "pointer",
              }}
            >
              NIFTY 50
            </button>
            <button
              onClick={() => setSymbol("BANKNIFTY")}
              style={{
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: 700,
                background: symbol === "BANKNIFTY" ? "var(--brand-primary, #f59e0b)" : "transparent",
                color: symbol === "BANKNIFTY" ? "#000" : "var(--text-primary)",
                border: "none",
                cursor: "pointer",
              }}
            >
              BANK NIFTY
            </button>
          </div>

          {/* Date Picker */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-muted)" }}>
            <Calendar size={14} />
            <span>Target Date:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{
                background: "rgba(0,0,0,0.3)",
                border: "1px solid var(--eb-border, rgba(255,255,255,0.15))",
                borderRadius: 4,
                padding: "4px 8px",
                color: "inherit",
                fontSize: 12,
                fontFamily: "var(--eb-mono, monospace)",
              }}
            />
          </div>

          {/* Custom Prev Close Override */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-muted)" }}>
            <span>Prev Close:</span>
            <input
              type="number"
              step="0.05"
              placeholder={data ? `${data.prevClose}` : "e.g. 25144.30"}
              value={customPrevClose}
              onChange={(e) => setCustomPrevClose(e.target.value)}
              style={{
                width: 110,
                background: "rgba(0,0,0,0.3)",
                border: "1px solid var(--eb-border, rgba(255,255,255,0.15))",
                borderRadius: 4,
                padding: "4px 8px",
                color: "inherit",
                fontSize: 12,
                fontFamily: "var(--eb-mono, monospace)",
              }}
            />
            {customPrevClose && (
              <button
                onClick={() => setCustomPrevClose("")}
                title="Reset to Authentic Close"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  padding: "4px",
                }}
              >
                <RefreshCw size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Action Buttons: Audio Alert & CSV Export */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => {
              setAudioEnabled(!audioEnabled);
              if (!audioEnabled) playChime(880, 150);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: 6,
              background: audioEnabled ? "rgba(0,201,122,0.12)" : "rgba(255,255,255,0.05)",
              border: audioEnabled ? "1px solid rgba(0,201,122,0.3)" : "1px solid var(--eb-border)",
              color: audioEnabled ? "var(--eb-bull, #00c97a)" : "var(--text-muted)",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {audioEnabled ? <Bell size={14} /> : <BellOff size={14} />}
            <span>{audioEnabled ? "Audio On" : "Muted"}</span>
          </button>

          <button
            onClick={exportCsv}
            disabled={!data}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: 6,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid var(--eb-border, rgba(255,255,255,0.15))",
              color: "inherit",
              fontSize: 12,
              cursor: data ? "pointer" : "not-allowed",
            }}
          >
            <Download size={14} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* INSTITUTIONAL NAVIGATION TABS */}
      <div
        style={{
          display: "flex",
          gap: 4,
          borderBottom: "1px solid var(--eb-border, rgba(255,255,255,0.1))",
          marginBottom: 20,
        }}
      >
        <button
          onClick={() => setTab("matrix")}
          style={{
            padding: "10px 18px",
            fontSize: 13,
            fontWeight: 700,
            background: "transparent",
            color: activeTab === "matrix" ? "var(--brand-primary, #f59e0b)" : "var(--text-muted)",
            border: "none",
            borderBottom: activeTab === "matrix" ? "2px solid var(--brand-primary, #f59e0b)" : "2px solid transparent",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Target size={16} />
          <span>🎯 HT Gann Intra V2 & Cube Matrix</span>
        </button>

        <button
          onClick={() => setTab("radar")}
          style={{
            padding: "10px 18px",
            fontSize: 13,
            fontWeight: 700,
            background: "transparent",
            color: activeTab === "radar" ? "var(--brand-primary, #f59e0b)" : "var(--text-muted)",
            border: "none",
            borderBottom: activeTab === "radar" ? "2px solid var(--brand-primary, #f59e0b)" : "2px solid transparent",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Radio size={16} />
          <span>📡 Live Level Radar & Audio Monitor</span>
        </button>

        <button
          onClick={() => setTab("cube")}
          style={{
            padding: "10px 18px",
            fontSize: 13,
            fontWeight: 700,
            background: "transparent",
            color: activeTab === "cube" ? "var(--brand-primary, #f59e0b)" : "var(--text-muted)",
            border: "none",
            borderBottom: activeTab === "cube" ? "2px solid var(--brand-primary, #f59e0b)" : "2px solid transparent",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Orbit size={16} />
          <span>🪐 4-Pillar Positional Cube</span>
        </button>

        <button
          onClick={() => setTab("sessions")}
          style={{
            padding: "10px 18px",
            fontSize: 13,
            fontWeight: 700,
            background: "transparent",
            color: activeTab === "sessions" ? "var(--brand-primary, #f59e0b)" : "var(--text-muted)",
            border: "none",
            borderBottom: activeTab === "sessions" ? "2px solid var(--brand-primary, #f59e0b)" : "2px solid transparent",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Clock size={16} />
          <span>🌐 Multi-Asset Sessions & Astro Clock</span>
        </button>
      </div>

      {/* LOADING OR ERROR STATE */}
      {intraQ.isLoading && (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
          <RefreshCw size={24} style={{ animation: "spin 1s linear infinite", marginBottom: 12 }} />
          <div>Computing 09:15 IST Vedic Ephemeris & Gann 360° Matrix...</div>
        </div>
      )}

      {intraQ.error && (
        <div style={{ padding: 20, borderRadius: 8, background: "rgba(255,58,92,0.1)", border: "1px solid rgba(255,58,92,0.3)", color: "var(--eb-bear, #ff3a5c)" }}>
          Failed to load Gann Intra V2 engine data. Please retry.
        </div>
      )}

      {/* TAB 1: 🎯 HT GANN INTRA V2 & CUBE MATRIX */}
      {data && activeTab === "matrix" && (
        <div>
          {/* STATS STRIP */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
              marginBottom: 18,
            }}
          >
            <StatCard label="Live Spot Price" value={fmt(data.livePrice)} sub={symbol} isPrice />
            <StatCard label="Prev Session Close" value={fmt(data.prevClose)} sub="Anchor" isPrice />
            <StatCard label="360° Upper Cycle" value={fmt(data.intraMatrix.upper360)} sub="Ceil Multiple" isPrice />
            <StatCard label="360° Lower Cycle" value={fmt(data.intraMatrix.lower360)} sub="Floor Multiple" isPrice />
            <StatCard
              label="🟢 Safe Buy Threshold"
              value={`<= ${fmt(data.intraMatrix.safeBuyThreshold)}`}
              sub={`Support Reversal (-${data.intraMatrix.safeBuffer})`}
              highlightColor="var(--eb-bull, #00c97a)"
            />
            <StatCard
              label="🔴 Safe Sell Threshold"
              value={`>= ${fmt(data.intraMatrix.safeSellThreshold)}`}
              sub={`Resistance Reversal (+${data.intraMatrix.safeBuffer})`}
              highlightColor="var(--eb-bear, #ff3a5c)"
            />
            <StatCard
              label="India VIX"
              value={data.indiaVix.toFixed(2)}
              sub={data.indiaVix < 15 ? "Low VIX (<15: S2/R2 Priority)" : "Normal/High VIX (>=15: S1/S2)"}
            />
          </div>

          {/* OM FLOOR PIVOTS STRIP */}
          {data.intraMatrix.floorPivots && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 12,
                padding: "10px 16px",
                background: "rgba(255,255,255,0.02)",
                border: "1px solid var(--eb-border, rgba(255,255,255,0.06))",
                borderRadius: 8,
                marginBottom: 16,
                fontSize: 12,
              }}
            >
              <span style={{ fontWeight: 700, color: "var(--brand-primary, #f59e0b)" }}>OM Floor Pivots:</span>
              <PivotPill label="S3" value={data.intraMatrix.floorPivots.S3} color="var(--eb-bull, #00c97a)" />
              <PivotPill label="S2" value={data.intraMatrix.floorPivots.S2} color="var(--eb-bull, #00c97a)" />
              <PivotPill label="S1" value={data.intraMatrix.floorPivots.S1} color="var(--eb-bull, #00c97a)" />
              <PivotPill label="P (Pivot)" value={data.intraMatrix.floorPivots.P} color="var(--text-primary)" isNeutral />
              <PivotPill label="R1" value={data.intraMatrix.floorPivots.R1} color="var(--eb-bear, #ff3a5c)" />
              <PivotPill label="R2" value={data.intraMatrix.floorPivots.R2} color="var(--eb-bear, #ff3a5c)" />
              <PivotPill label="R3" value={data.intraMatrix.floorPivots.R3} color="var(--eb-bear, #ff3a5c)" />
            </div>
          )}

          {/* 36-LEVEL MATRIX TABLE */}
          <div
            style={{
              overflowX: "auto",
              background: "var(--surface-card, rgba(255,255,255,0.02))",
              border: "1px solid var(--eb-border, rgba(255,255,255,0.08))",
              borderRadius: 8,
              marginBottom: 16,
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
              <thead>
                <tr
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    borderBottom: "1px solid var(--eb-border, rgba(255,255,255,0.1))",
                    color: "var(--text-muted)",
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: 0.6,
                  }}
                >
                  <th style={{ padding: "12px 16px" }}>Planet</th>
                  <th style={{ padding: "12px 14px", fontFamily: "var(--eb-mono, monospace)" }}>Absolute Longitude</th>
                  <th style={{ padding: "12px 14px" }}>L1 (Upper + Deg)</th>
                  <th style={{ padding: "12px 14px" }}>L2 (Lower + Deg)</th>
                  <th style={{ padding: "12px 14px" }}>L3 (Upper - Deg)</th>
                  <th style={{ padding: "12px 14px" }}>L4 (Lower - Deg)</th>
                </tr>
              </thead>
              <tbody>
                {data.intraMatrix.rows.map((row) => (
                  <tr
                    key={row.planet}
                    style={{
                      borderBottom: "1px solid var(--eb-border, rgba(255,255,255,0.05))",
                      background: row.isPrimaryPlanet ? "rgba(245,158,11,0.03)" : "transparent",
                    }}
                  >
                    <td style={{ padding: "12px 16px", fontWeight: 700 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span>{row.planet}</span>
                        {row.isPrimaryPlanet && (
                          <span
                            style={{
                              fontSize: 10,
                              padding: "1px 5px",
                              borderRadius: 4,
                              background: "rgba(245,158,11,0.2)",
                              color: "#f59e0b",
                              fontWeight: 700,
                            }}
                          >
                            👑 PRIMARY
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: "12px 14px", fontFamily: "var(--eb-mono, monospace)", color: "var(--text-muted)" }}>
                      {row.absDegree.toFixed(2)}°
                    </td>
                    <MatrixCellTd cell={row.L1} prevClose={data.prevClose} />
                    <MatrixCellTd cell={row.L2} prevClose={data.prevClose} />
                    <MatrixCellTd cell={row.L3} prevClose={data.prevClose} />
                    <MatrixCellTd cell={row.L4} prevClose={data.prevClose} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* RISK RULES & EXECUTION POLICY BANNER */}
          <div
            style={{
              padding: "14px 18px",
              borderRadius: 8,
              background: "linear-gradient(135deg, rgba(245,158,11,0.1), rgba(245,158,11,0.03))",
              border: "1px solid rgba(245,158,11,0.3)",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <ShieldCheck size={22} style={{ color: "var(--brand-primary, #f59e0b)", flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 800, fontSize: 13, color: "var(--brand-primary, #f59e0b)" }}>
                FIXED INTRADAY RISK RULES ({symbol})
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                {data.intraMatrix.riskRules.description}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: 📡 LIVE LEVEL RADAR & AUDIO MONITOR */}
      {data && activeTab === "radar" && (
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 16,
              padding: "12px 16px",
              background: "var(--surface-card)",
              borderRadius: 8,
              border: "1px solid var(--eb-border)",
            }}
          >
            <div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" }}>Current Price Target Tracker</div>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "var(--eb-mono)" }}>
                {fmt(data.livePrice)} <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{symbol}</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ padding: "6px 12px", borderRadius: 6, background: "rgba(0,201,122,0.1)", color: "var(--eb-bull)", fontSize: 12, fontWeight: 700 }}>
                Target 1: +{data.intraMatrix.riskRules.target1} Pts
              </div>
              <div style={{ padding: "6px 12px", borderRadius: 6, background: "rgba(255,58,92,0.1)", color: "var(--eb-bear)", fontSize: 12, fontWeight: 700 }}>
                Stop Loss: -{data.intraMatrix.riskRules.spotSl} Pts
              </div>
            </div>
          </div>

          <div
            style={{
              background: "var(--surface-card)",
              border: "1px solid var(--eb-border)",
              borderRadius: 8,
              overflowX: "auto",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid var(--eb-border)", color: "var(--text-muted)", fontSize: 11, textTransform: "uppercase" }}>
                  <th style={{ padding: "10px 14px" }}>Proximity</th>
                  <th style={{ padding: "10px 14px" }}>Level (₹)</th>
                  <th style={{ padding: "10px 14px" }}>Distance to Spot</th>
                  <th style={{ padding: "10px 14px" }}>Planet & Column</th>
                  <th style={{ padding: "10px 14px" }}>Classification</th>
                  <th style={{ padding: "10px 14px" }}>OM Confluence</th>
                  <th style={{ padding: "10px 14px" }}>Actionable Setup</th>
                </tr>
              </thead>
              <tbody>
                {data.intraMatrix.allLevelsSorted
                  .map((l) => ({ ...l, distToSpot: Math.abs(l.level - data.livePrice) }))
                  .sort((a, b) => a.distToSpot - b.distToSpot)
                  .map((l, idx) => {
                    const isTouched = l.distToSpot <= (symbol === "BANKNIFTY" ? 10 : 3);
                    const isApproaching = l.distToSpot <= (symbol === "BANKNIFTY" ? 35 : 15);
                    const isAbove = l.level >= data.livePrice;

                    return (
                      <tr
                        key={`${l.planet}-${l.column}-${idx}`}
                        style={{
                          borderBottom: "1px solid var(--eb-border, rgba(255,255,255,0.04))",
                          background: isTouched
                            ? "rgba(245,158,11,0.15)"
                            : isApproaching
                              ? "rgba(245,158,11,0.05)"
                              : "transparent",
                        }}
                      >
                        <td style={{ padding: "10px 14px" }}>
                          {isTouched ? (
                            <span style={{ padding: "2px 8px", borderRadius: 4, background: "#f59e0b", color: "#000", fontWeight: 800, fontSize: 10 }}>
                              🎯 TOUCHED
                            </span>
                          ) : isApproaching ? (
                            <span style={{ padding: "2px 8px", borderRadius: 4, background: "rgba(245,158,11,0.2)", color: "#f59e0b", fontWeight: 700, fontSize: 10 }}>
                              ⚠️ APPROACHING
                            </span>
                          ) : (
                            <span style={{ color: "var(--text-muted)", fontSize: 11 }}>Radar</span>
                          )}
                        </td>
                        <td style={{ padding: "10px 14px", fontWeight: 800, fontFamily: "var(--eb-mono)" }}>
                          {fmt(l.level)}
                        </td>
                        <td style={{ padding: "10px 14px", fontFamily: "var(--eb-mono)", color: isAbove ? "var(--eb-bear)" : "var(--eb-bull)" }}>
                          {isAbove ? `+${l.distToSpot.toFixed(1)} pts` : `-${l.distToSpot.toFixed(1)} pts`}
                        </td>
                        <td style={{ padding: "10px 14px", color: "var(--text-muted)" }}>
                          {l.planet} ({l.column}) {l.isPrimary && "👑"}
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          <span
                            style={{
                              padding: "2px 6px",
                              borderRadius: 4,
                              fontSize: 10,
                              fontWeight: 700,
                              background:
                                l.safety === "SAFE_BUY"
                                  ? "rgba(0,201,122,0.15)"
                                  : l.safety === "SAFE_SELL"
                                    ? "rgba(255,58,92,0.15)"
                                    : "rgba(255,255,255,0.05)",
                              color:
                                l.safety === "SAFE_BUY"
                                  ? "var(--eb-bull)"
                                  : l.safety === "SAFE_SELL"
                                    ? "var(--eb-bear)"
                                    : "var(--text-muted)",
                            }}
                          >
                            {l.safety}
                          </span>
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          {l.confluenceBadge ? (
                            <span style={{ color: "#f59e0b", fontWeight: 700, fontSize: 11 }}>
                              {l.confluenceBadge} ({l.confluencePivot})
                            </span>
                          ) : (
                            <span style={{ color: "var(--text-muted)", fontSize: 11 }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: "10px 14px", fontSize: 11 }}>
                          {l.safety === "SAFE_BUY" ? (
                            <span style={{ color: "var(--eb-bull)" }}>Support Reversal → Buy Call (SL: {data.intraMatrix.riskRules.spotSl}p)</span>
                          ) : l.safety === "SAFE_SELL" ? (
                            <span style={{ color: "var(--eb-bear)" }}>Resistance Reversal → Buy Put (SL: {data.intraMatrix.riskRules.spotSl}p)</span>
                          ) : (
                            <span style={{ color: "var(--text-muted)" }}>Inner Zone (Avoid Market Orders)</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: 🪐 4-PILLAR POSITIONAL CUBE */}
      {data && activeTab === "cube" && (
        <div>
          {/* MASTER VERDICT HERO */}
          <div
            style={{
              padding: "20px 24px",
              borderRadius: 10,
              background: data.masterCube.isMasterCubeActive
                ? data.masterCube.positionalDirection === "BULLISH"
                  ? "linear-gradient(135deg, rgba(0,201,122,0.15), rgba(0,201,122,0.03))"
                  : "linear-gradient(135deg, rgba(255,58,92,0.15), rgba(255,58,92,0.03))"
                : "rgba(255,255,255,0.02)",
              border: data.masterCube.isMasterCubeActive
                ? data.masterCube.positionalDirection === "BULLISH"
                  ? "1px solid rgba(0,201,122,0.4)"
                  : "1px solid rgba(255,58,92,0.4)"
                : "1px solid var(--eb-border)",
              marginBottom: 20,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, color: "var(--text-muted)" }}>
                  Institutional 4-Pillar Cube Status (3/4 Rule)
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>
                  {data.masterCube.verdictBadge}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Positional Pillar Alignment</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>
                  {data.masterCube.positionalVotes.bullishCount} Bullish vs {data.masterCube.positionalVotes.bearishCount} Bearish Votes
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: 16,
                padding: "12px 16px",
                borderRadius: 6,
                background: "rgba(0,0,0,0.2)",
                fontSize: 13,
                color: "var(--text-primary)",
              }}
            >
              <strong>Execution Directive:</strong> {data.masterCube.executionPlan}
            </div>
          </div>

          {/* 3 POSITIONAL PILLARS BREAKDOWN GRID */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 16, marginBottom: 20 }}>
            {/* PILLAR 2: STARWISE NAKSHATRA */}
            <div style={{ padding: 16, borderRadius: 8, background: "var(--surface-card)", border: "1px solid var(--eb-border)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 14 }}>
                  <Moon size={16} style={{ color: "#f59e0b" }} />
                  <span>Pillar 2: Moon Nakshatra & RSI 14</span>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    padding: "2px 8px",
                    borderRadius: 4,
                    fontWeight: 700,
                    background:
                      data.pillar2Starwise.nature === "BULL"
                        ? "rgba(0,201,122,0.15)"
                        : data.pillar2Starwise.nature === "BEAR"
                          ? "rgba(255,58,92,0.15)"
                          : "rgba(255,255,255,0.05)",
                    color:
                      data.pillar2Starwise.nature === "BULL"
                        ? "var(--eb-bull)"
                        : data.pillar2Starwise.nature === "BEAR"
                          ? "var(--eb-bear)"
                          : "var(--text-muted)",
                  }}
                >
                  {data.pillar2Starwise.badge}
                </span>
              </div>
              <div style={{ fontSize: 13, marginBottom: 8 }}>
                <strong>Active Moon Star:</strong> {data.moonNakshatra}
                {data.pillar2Starwise.starInfo && (
                  <span style={{ color: "var(--text-muted)", marginLeft: 6 }}>
                    ({data.pillar2Starwise.starInfo.lord} Lord · {data.pillar2Starwise.starInfo.historicalRecord})
                  </span>
                )}
              </div>
              <div style={{ fontSize: 13, marginBottom: 12 }}>
                <strong>Daily RSI (14):</strong> {data.dailyRsi14 != null ? data.dailyRsi14.toFixed(1) : "—"}{" "}
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>(Bullish Sync &lt;= 35 | Bearish Sync &gt;= 65)</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", background: "rgba(255,255,255,0.02)", padding: 8, borderRadius: 4 }}>
                <strong>Holding Rule:</strong> {data.pillar2Starwise.holdingRule}
              </div>
            </div>

            {/* PILLAR 3: RETROGRADE & DAILY EMA 13 */}
            <div style={{ padding: 16, borderRadius: 8, background: "var(--surface-card)", border: "1px solid var(--eb-border)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 14 }}>
                  <Orbit size={16} style={{ color: "#f59e0b" }} />
                  <span>Pillar 3: Retrograde & Daily EMA 13</span>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    padding: "2px 8px",
                    borderRadius: 4,
                    fontWeight: 700,
                    background:
                      data.pillar3Retrograde.status === "ACTIVE_CONFIRMED"
                        ? "rgba(0,201,122,0.15)"
                        : data.pillar3Retrograde.status === "EXIT_SIGNAL"
                          ? "rgba(255,58,92,0.15)"
                          : "rgba(255,255,255,0.05)",
                    color:
                      data.pillar3Retrograde.status === "ACTIVE_CONFIRMED"
                        ? "var(--eb-bull)"
                        : data.pillar3Retrograde.status === "EXIT_SIGNAL"
                          ? "var(--eb-bear)"
                          : "var(--text-muted)",
                  }}
                >
                  {data.pillar3Retrograde.badge}
                </span>
              </div>
              <div style={{ fontSize: 13, marginBottom: 8 }}>
                <strong>Active Retrogrades:</strong>{" "}
                {data.pillar3Retrograde.activeRetrogrades.length > 0
                  ? data.pillar3Retrograde.activeRetrogrades.join(", ")
                  : "None active"}
              </div>
              <div style={{ fontSize: 13, marginBottom: 12 }}>
                <strong>Spot vs Daily EMA 13:</strong> Spot {fmt(data.livePrice)} vs EMA 13{" "}
                {data.dailyEma13 != null ? fmt(data.dailyEma13) : "—"}
              </div>
              {data.pillar3Retrograde.exitWarning ? (
                <div style={{ fontSize: 11, color: "var(--eb-bear)", background: "rgba(255,58,92,0.08)", padding: 8, borderRadius: 4 }}>
                  {data.pillar3Retrograde.exitWarning}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: "var(--text-muted)", background: "rgba(255,255,255,0.02)", padding: 8, borderRadius: 4 }}>
                  Holding filter active: Mars/Jupiter bullish longs held above Daily EMA 13; Saturn/Mercury shorts held below EMA 13.
                </div>
              )}
            </div>

            {/* PILLAR 4: 18 EMPIRICAL ASPECTS SUMMARY */}
            <div style={{ padding: 16, borderRadius: 8, background: "var(--surface-card)", border: "1px solid var(--eb-border)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 14 }}>
                  <Layers size={16} style={{ color: "#f59e0b" }} />
                  <span>Pillar 4: Empirical Aspects (±3° Orb)</span>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    padding: "2px 8px",
                    borderRadius: 4,
                    fontWeight: 700,
                    background:
                      data.pillar4Aspects.netBias === "BULLISH"
                        ? "rgba(0,201,122,0.15)"
                        : data.pillar4Aspects.netBias === "BEARISH"
                          ? "rgba(255,58,92,0.15)"
                          : "rgba(255,255,255,0.05)",
                    color:
                      data.pillar4Aspects.netBias === "BULLISH"
                        ? "var(--eb-bull)"
                        : data.pillar4Aspects.netBias === "BEARISH"
                          ? "var(--eb-bear)"
                          : "var(--text-muted)",
                  }}
                >
                  Net: {data.pillar4Aspects.netBias}
                </span>
              </div>
              <div style={{ fontSize: 13, marginBottom: 8 }}>
                <strong>Active Bullish Aspects:</strong> {data.pillar4Aspects.activeBullishAspects.length} ({data.pillar4Aspects.totalBullHits} historical hits)
              </div>
              <div style={{ fontSize: 13, marginBottom: 12 }}>
                <strong>Active Bearish Aspects:</strong> {data.pillar4Aspects.activeBearishAspects.length} ({data.pillar4Aspects.totalBearHits} historical hits)
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", background: "rgba(255,255,255,0.02)", padding: 8, borderRadius: 4 }}>
                {data.pillar4Aspects.summary}
              </div>
            </div>
          </div>

          {/* 18 EMPIRICAL PLANET ASPECTS TABLE */}
          <div style={{ background: "var(--surface-card)", border: "1px solid var(--eb-border)", borderRadius: 8, overflowX: "auto" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--eb-border)", fontWeight: 700, fontSize: 13 }}>
              Empirical 18 Planet Aspects Matrix (10-Year Backtested Hits)
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.02)", borderBottom: "1px solid var(--eb-border)", color: "var(--text-muted)", fontSize: 11, textTransform: "uppercase" }}>
                  <th style={{ padding: "8px 14px" }}>Aspect Setup</th>
                  <th style={{ padding: "8px 14px" }}>Nature</th>
                  <th style={{ padding: "8px 14px" }}>Target Angle</th>
                  <th style={{ padding: "8px 14px" }}>Actual Separation</th>
                  <th style={{ padding: "8px 14px" }}>Orb Difference</th>
                  <th style={{ padding: "8px 14px" }}>Hits</th>
                  <th style={{ padding: "8px 14px" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.pillar4Aspects.allEvaluations.map((ev) => (
                  <tr
                    key={ev.aspect.id}
                    style={{
                      borderBottom: "1px solid var(--eb-border, rgba(255,255,255,0.04))",
                      background: ev.isActive
                        ? ev.aspect.nature === "BULL"
                          ? "rgba(0,201,122,0.08)"
                          : "rgba(255,58,92,0.08)"
                        : "transparent",
                    }}
                  >
                    <td style={{ padding: "8px 14px", fontWeight: 700 }}>{ev.aspect.description}</td>
                    <td style={{ padding: "8px 14px" }}>
                      <span
                        style={{
                          padding: "1px 6px",
                          borderRadius: 3,
                          fontSize: 10,
                          fontWeight: 700,
                          background: ev.aspect.nature === "BULL" ? "rgba(0,201,122,0.15)" : "rgba(255,58,92,0.15)",
                          color: ev.aspect.nature === "BULL" ? "var(--eb-bull)" : "var(--eb-bear)",
                        }}
                      >
                        {ev.aspect.nature}
                      </span>
                    </td>
                    <td style={{ padding: "8px 14px", fontFamily: "var(--eb-mono)" }}>{ev.aspect.targetAngle}°</td>
                    <td style={{ padding: "8px 14px", fontFamily: "var(--eb-mono)" }}>{ev.actualSeparation.toFixed(2)}°</td>
                    <td style={{ padding: "8px 14px", fontFamily: "var(--eb-mono)" }}>{ev.orbDifference.toFixed(2)}°</td>
                    <td style={{ padding: "8px 14px", fontFamily: "var(--eb-mono)" }}>{ev.aspect.hits}</td>
                    <td style={{ padding: "8px 14px" }}>
                      {ev.isActive ? (
                        <span style={{ color: ev.aspect.nature === "BULL" ? "var(--eb-bull)" : "var(--eb-bear)", fontWeight: 700 }}>
                          ACTIVE (±3°)
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>Inactive</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: 🌐 MULTI-ASSET SESSIONS & ASTRO CLOCK */}
      {activeTab === "sessions" && (
        <div>
          {/* MARKET SESSIONS GRID */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14, marginBottom: 20 }}>
            <SessionClockCard
              market="NSE / BSE India Equity"
              hours="09:15 AM – 03:30 PM IST"
              active={session.status === "LIVE MARKET"}
              statusText={session.status}
              countdown={`${Math.max(0, Math.floor(session.countdownMs / 60000))}m to transition`}
            />
            <SessionClockCard
              market="MCX India Commodity"
              hours="09:00 AM – 11:30 PM IST"
              active={true}
              statusText="ACTIVE SESSION"
              countdown="Closes 23:30 IST"
            />
            <SessionClockCard
              market="US / Global Equity"
              hours="07:00 PM – 01:30 AM IST"
              active={false}
              statusText="EVENING SESSION"
              countdown="Opens 19:00 IST"
            />
            <SessionClockCard
              market="Crypto Market (BTC/ETH/SOL)"
              hours="24 Hours / 7 Days Continuous"
              active={true}
              statusText="24/7 OPEN"
              countdown="Continuous"
            />
          </div>

          {/* MOON NAKSHATRA & EPHEMERIS DETAIL */}
          {astro && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 16 }}>
              <div style={{ padding: 16, borderRadius: 8, background: "var(--surface-card)", border: "1px solid var(--eb-border)" }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                  <Moon size={16} style={{ color: "#f59e0b" }} />
                  <span>Moon Phase & Tithi Clock</span>
                </div>
                <div style={{ fontSize: 13, marginBottom: 6 }}>
                  <strong>Phase:</strong> {astro.moonPhase.phaseName} ({astro.moonPhase.illumination}% Illumination)
                </div>
                <div style={{ fontSize: 13, marginBottom: 6 }}>
                  <strong>Moon Sign:</strong> {astro.moonSign} ({astro.moonDegree.toFixed(2)}°)
                </div>
                <div style={{ fontSize: 13, marginBottom: 6 }}>
                  <strong>Active Nakshatra:</strong> {astro.moonNakshatra}
                </div>
                <div style={{ fontSize: 13 }}>
                  <strong>Ayanamsa:</strong> {astro.ayanamsa.toFixed(4)}° (Lahiri Sidereal)
                </div>
              </div>

              <div style={{ padding: 16, borderRadius: 8, background: "var(--surface-card)", border: "1px solid var(--eb-border)" }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                  <Sun size={16} style={{ color: "#f59e0b" }} />
                  <span>Sun Schedule (Mumbai / IST)</span>
                </div>
                <div style={{ fontSize: 13, marginBottom: 6 }}>
                  <strong>Current IST Time:</strong> {istClock}
                </div>
                <div style={{ fontSize: 13, marginBottom: 6 }}>
                  <strong>Trading Session Anchor:</strong> 09:15:00 AM IST
                </div>
                <div style={{ fontSize: 13, marginBottom: 6 }}>
                  <strong>Intraday Cycle Factor:</strong> {data ? data.intraMatrix.factor.toFixed(4) : "—"}
                </div>
                <div style={{ fontSize: 13 }}>
                  <strong>Gann Intra Engine Version:</strong> V2.0 HT Authentic
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function StatCard({
  label,
  value,
  sub,
  highlightColor,
  isPrice,
}: {
  label: string;
  value: string;
  sub?: string;
  highlightColor?: string;
  isPrice?: boolean;
}) {
  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: 8,
        background: "var(--surface-card, rgba(255,255,255,0.02))",
        border: "1px solid var(--eb-border, rgba(255,255,255,0.08))",
      }}
    >
      <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 800,
          fontFamily: isPrice ? "var(--eb-mono, monospace)" : "inherit",
          color: highlightColor ?? "inherit",
          marginTop: 4,
        }}
      >
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function PivotPill({ label, value, color, isNeutral }: { label: string; value: number; color: string; isNeutral?: boolean }) {
  return (
    <div
      style={{
        padding: "4px 8px",
        borderRadius: 4,
        background: isNeutral ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.02)",
        border: `1px solid ${color}40`,
        fontFamily: "var(--eb-mono, monospace)",
      }}
    >
      <span style={{ color: "var(--text-muted)", marginRight: 6 }}>{label}</span>
      <strong style={{ color }}>{fmt(value)}</strong>
    </div>
  );
}

function MatrixCellTd({
  cell,
  prevClose,
}: {
  cell: {
    level: number;
    safety: "SAFE_BUY" | "SAFE_SELL" | "RISKY_INNER";
    confluenceBadge?: string;
    confluencePivot?: string;
    isPrimary?: boolean;
    isPreferredOuter?: boolean;
  };
  prevClose: number;
}) {
  const isSafeBuy = cell.safety === "SAFE_BUY";
  const isSafeSell = cell.safety === "SAFE_SELL";

  const bg = isSafeBuy
    ? "rgba(0, 201, 122, 0.12)"
    : isSafeSell
      ? "rgba(255, 58, 92, 0.12)"
      : "rgba(255, 255, 255, 0.02)";

  const border = isSafeBuy
    ? "1px solid rgba(0, 201, 122, 0.3)"
    : isSafeSell
      ? "1px solid rgba(255, 58, 92, 0.3)"
      : "1px solid var(--eb-border, rgba(255,255,255,0.05))";

  const textColor = isSafeBuy ? "var(--eb-bull, #00c97a)" : isSafeSell ? "var(--eb-bear, #ff3a5c)" : "var(--text-primary)";

  return (
    <td style={{ padding: "8px 10px" }}>
      <div
        style={{
          padding: "8px 10px",
          borderRadius: 6,
          background: bg,
          border,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
          <span style={{ fontFamily: "var(--eb-mono, monospace)", fontWeight: 800, fontSize: 14, color: textColor }}>
            {fmt(cell.level)}
          </span>
          <span
            style={{
              fontSize: 9,
              fontWeight: 800,
              padding: "1px 4px",
              borderRadius: 3,
              background: isSafeBuy ? "rgba(0,201,122,0.2)" : isSafeSell ? "rgba(255,58,92,0.2)" : "rgba(255,255,255,0.08)",
              color: textColor,
            }}
          >
            {isSafeBuy ? "SAFE BUY" : isSafeSell ? "SAFE SELL" : "RISKY"}
          </span>
        </div>

        {/* Confluence Badge if matching Floor Pivot */}
        {cell.confluenceBadge && (
          <div style={{ fontSize: 9, color: "#f59e0b", fontWeight: 700, marginTop: 4 }}>
            {cell.confluenceBadge} ({cell.confluencePivot})
          </div>
        )}

        {/* Preferred Outer Badge */}
        {cell.isPreferredOuter && (
          <div style={{ fontSize: 9, color: "var(--brand-primary, #f59e0b)", marginTop: 2 }}>
            ★ PREFERRED OUTER
          </div>
        )}
      </div>
    </td>
  );
}

function SessionClockCard({
  market,
  hours,
  active,
  statusText,
  countdown,
}: {
  market: string;
  hours: string;
  active: boolean;
  statusText: string;
  countdown: string;
}) {
  return (
    <div
      style={{
        padding: 16,
        borderRadius: 8,
        background: "var(--surface-card)",
        border: active ? "1px solid rgba(0,201,122,0.3)" : "1px solid var(--eb-border)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{market}</div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            padding: "2px 6px",
            borderRadius: 4,
            background: active ? "rgba(0,201,122,0.15)" : "rgba(255,255,255,0.05)",
            color: active ? "var(--eb-bull)" : "var(--text-muted)",
          }}
        >
          {statusText}
        </span>
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{hours}</div>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--brand-primary, #f59e0b)", marginTop: 8 }}>
        {countdown}
      </div>
    </div>
  );
}
