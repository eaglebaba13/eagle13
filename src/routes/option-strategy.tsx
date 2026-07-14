import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import {
  getOptionStrategy,
  type OptionStrategyData,
  type Sector,
  type TopStock,
} from "@/lib/option-strategy.functions";
import { Disclaimer } from "@/components/Disclaimer";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AppSidebar } from "@/components/AppSidebar";
import { ApexChart } from "@/components/ApexChart";
import { NewsCenter } from "@/components/NewsPopup";
import {
  Volume2,
  VolumeX,
  TrendingUp,
  TrendingDown,
  Activity,
  Gauge,
  Zap,
  Radio,
} from "lucide-react";
import logoUrl from "@/assets/eaglebaba-logo.png";

const C = {
  bg: "var(--eb-bg)",
  card: "var(--eb-card)",
  border: "var(--eb-border)",
  green: "var(--eb-bull)",
  red: "var(--eb-bear)",
  gold: "var(--eb-accent)",
  blue: "var(--eb-blue)",
  text: "var(--eb-text)",
  muted: "var(--eb-muted)",
};

const REFRESH_MS = 30_000;

const strategyQuery = () =>
  queryOptions({
    queryKey: ["option-strategy"],
    queryFn: () => getOptionStrategy(),
    refetchInterval: REFRESH_MS,
    refetchOnWindowFocus: true,
  });

export const Route = createFileRoute("/option-strategy")({
  loader: ({ context }) => context.queryClient.ensureQueryData(strategyQuery()),
  component: OptionStrategyTerminal,
  head: () => ({
    meta: [
      { title: "NIFTY50 Option Buying Strategy | EagleBABA" },
      {
        name: "description",
        content:
          "Institutional-grade NIFTY option-buying decision engine combining India VIX, NSE & NIFTY50 market breadth, Top-10 weightage, sector strength, option-chain PCR and astro bias into BUY CE / BUY PE / WAIT signals refreshed every 30 seconds.",
      },
      { property: "og:title", content: "NIFTY50 Option Buying Strategy | EagleBABA" },
      {
        property: "og:description",
        content: "Real-time directional bias for NIFTY option buying — BUY CE / BUY PE / WAIT with confidence and reasoning.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: ({ error }) => (
    <div style={{ background: C.bg, minHeight: "100vh", padding: 40, color: C.red }}>
      <p style={{ fontFamily: "var(--eb-mono)" }}>Strategy data unavailable: {error.message}</p>
      <Link to="/astro" style={{ color: C.blue }}>← Back to Astro dashboard</Link>
    </div>
  ),
  notFoundComponent: () => (
    <div style={{ background: C.bg, minHeight: "100vh", padding: 40, color: C.muted }}>
      <p style={{ fontFamily: "var(--eb-mono)" }}>Not found.</p>
      <Link to="/" style={{ color: C.blue }}>← Back to dashboard</Link>
    </div>
  ),
});

/* ------------------------------ helpers ------------------------------ */

function useIstClock() {
  const [now, setNow] = useState("--:--:--");
  useEffect(() => {
    const tick = () =>
      setNow(new Date().toLocaleTimeString("en-GB", { hour12: false, timeZone: "Asia/Kolkata" }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

function beep(freq = 880) {
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = freq;
    g.gain.value = 0.05;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    setTimeout(() => {
      o.stop();
      ctx.close();
    }, 200);
  } catch {
    /* ignore */
  }
}

/* ------------------------------ component ------------------------------ */

function OptionStrategyTerminal() {
  const { data, isFetching, dataUpdatedAt } = useSuspenseQuery(strategyQuery());
  const clock = useIstClock();
  const [mounted, setMounted] = useState(false);
  const [sound, setSound] = useState(false);
  const prevAlert = useRef<string>("NONE");

  useEffect(() => {
    setMounted(true);
    const s = typeof localStorage !== "undefined" ? localStorage.getItem("eb-os-sound") : null;
    if (s === "1") setSound(true);
  }, []);
  useEffect(() => {
    if (typeof localStorage !== "undefined") localStorage.setItem("eb-os-sound", sound ? "1" : "0");
  }, [sound]);

  useEffect(() => {
    if (data.specialAlert.active && data.specialAlert.type !== prevAlert.current && sound) {
      beep(data.specialAlert.type === "CALL" ? 990 : 440);
    }
    prevAlert.current = data.specialAlert.type;
  }, [data.specialAlert, sound]);

  const rec = data.recommendation;
  const recColor = rec.action === "BUY CE" ? C.green : rec.action === "BUY PE" ? C.red : C.gold;
  const lastUpdated = new Date(dataUpdatedAt).toLocaleTimeString("en-GB", { hour12: false, timeZone: "Asia/Kolkata" });

  const oc = data.optionChain;

  if (!mounted) {
    return (
      <div style={{ background: C.bg, minHeight: "100vh", color: C.muted, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: C.text }}>📈 NIFTY50 Option Buying Strategy</div>
          <div style={{ marginTop: 8, fontSize: 13 }}>Connecting to live breadth, VIX, sector & option-chain feed…</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "var(--eb-head, system-ui, sans-serif)" }}>
      <div className="eb-space-bg" aria-hidden="true" />
      <style>{`
        .os-grid { display:grid; gap:12px; }
        .os-mono { font-family:var(--eb-mono, ui-monospace, monospace); }
        .os-table { width:100%; border-collapse:collapse; font-size:12.5px; }
        .os-table th { text-align:left; color:var(--eb-muted); font-weight:600; font-size:10.5px; text-transform:uppercase; letter-spacing:.5px; padding:9px 10px; border-bottom:1px solid var(--eb-border); }
        .os-table td { padding:9px 10px; border-bottom:1px solid var(--eb-border); white-space:nowrap; }
        @keyframes osPulse { 0%,100%{opacity:1} 50%{opacity:.55} }
        .os-live-dot { width:8px;height:8px;border-radius:50%;background:var(--eb-bull);box-shadow:0 0 8px var(--eb-bull);animation:osPulse 1.4s infinite;display:inline-block }
        @keyframes osGlowGreen { 0%,100%{box-shadow:0 0 8px rgba(16,185,129,.5),0 0 0 1px rgba(16,185,129,.6) inset} 50%{box-shadow:0 0 30px rgba(16,185,129,.95),0 0 0 2px rgba(16,185,129,.9) inset} }
        @keyframes osGlowRed { 0%,100%{box-shadow:0 0 8px rgba(239,68,68,.5),0 0 0 1px rgba(239,68,68,.6) inset} 50%{box-shadow:0 0 30px rgba(239,68,68,.95),0 0 0 2px rgba(239,68,68,.9) inset} }
        .os-blink-green { animation: osGlowGreen 1s infinite; border:1px solid var(--eb-bull) !important; }
        .os-blink-red { animation: osGlowRed 1s infinite; border:1px solid var(--eb-bear) !important; }
        @keyframes osAlert { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.85;transform:scale(1.01)} }
        .os-alert { animation: osAlert 0.9s infinite; }
        .os-heat { display:flex; flex-wrap:wrap; gap:6px; }
        .os-heat > * { flex-basis:120px; }
        .os-chip { font-size:11px; background:rgba(76,157,255,0.12); border:1px solid var(--eb-blue); padding:2px 8px; border-radius:6px; }
        .os10-head, .os10-row { display:grid; grid-template-columns:44px minmax(120px,1.4fr) 90px 110px 80px 88px 96px; gap:8px; align-items:center; padding:8px 14px; }
        .os10-head { color:var(--eb-muted); font-size:10px; text-transform:uppercase; letter-spacing:.6px; border-bottom:1px solid var(--eb-border); font-weight:600; }
        .os10-row { border-bottom:1px solid rgba(255,255,255,0.05); font-size:12.5px; background:var(--eb-card); }
        .os10-row .os-mono { font-size:12.5px; }
        .os10-badge { font-size:9.5px; font-weight:800; letter-spacing:.4px; padding:1px 6px; border-radius:5px; white-space:nowrap; }
        .os10-select { background:rgba(255,255,255,0.05); color:var(--eb-text); border:1px solid var(--eb-border); border-radius:8px; padding:5px 10px; font-size:12px; font-family:var(--eb-mono,monospace); cursor:pointer; }
        @keyframes os10FlashUp { 0%{background:rgba(16,185,129,.55)} 100%{background:transparent} }
        @keyframes os10FlashDn { 0%{background:rgba(239,68,68,.55)} 100%{background:transparent} }
        .os10-flash-up { animation:os10FlashUp .7s ease-out; border-radius:5px; }
        .os10-flash-dn { animation:os10FlashDn .7s ease-out; border-radius:5px; }
        .ossec-head, .ossec-row { display:grid; grid-template-columns:40px minmax(120px,1.3fr) 96px 74px 74px 84px 96px 100px; gap:8px; align-items:center; padding:8px 14px; }
        .ossec-head { color:var(--eb-muted); font-size:10px; text-transform:uppercase; letter-spacing:.6px; border-bottom:1px solid var(--eb-border); font-weight:600; }
        .ossec-row { border-bottom:1px solid rgba(255,255,255,0.05); font-size:12.5px; background:var(--eb-card); }
        @media (max-width:720px){
          .ossec-head { display:none; }
          .ossec-row { grid-template-columns:34px 1fr auto; grid-auto-rows:auto; row-gap:2px; }
          .ossec-row .ossec-c-adv, .ossec-row .ossec-c-dec, .ossec-row .ossec-c-str, .ossec-row .ossec-c-status, .ossec-row .ossec-c-contrib { display:none; }
        }
        @media (max-width:720px){
          .os10-head { display:none; }
          .os10-row { grid-template-columns:34px 1fr auto; grid-auto-rows:auto; row-gap:2px; }
          .os10-row .os10-c-live, .os10-row .os10-c-weight, .os10-row .os10-c-status, .os10-row .os10-c-impact { display:none; }
        }
        @media (max-width:820px){ .os-hide-sb{ display:none; } }
      `}</style>

      <div style={{ maxWidth: 1520, margin: "0 auto", padding: "18px 16px 64px", position: "relative", zIndex: 1 }}>
        {/* Header */}
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <img src={logoUrl} alt="EagleBABA logo" width={52} height={52} style={{ width: 52, height: 52, borderRadius: 12, objectFit: "cover", boxShadow: "0 0 16px rgba(212,175,55,0.35)" }} />
            <div>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: 0.4, display: "flex", alignItems: "center", gap: 10 }}>
                NIFTY50 Option Buying Strategy
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: C.green, border: `1px solid ${C.green}`, borderRadius: 20, padding: "2px 10px" }}>
                  <span className="os-live-dot" /> LIVE
                </span>
              </h1>
              <div style={{ fontSize: 12, color: C.muted }}>
                Breadth · VIX · Sectors · Top-10 · Option Chain PCR · Astro bias · auto-refresh 30s
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span className="os-mono" style={{ fontSize: 13, color: C.muted }}>IST {clock}</span>
            <button onClick={() => setSound((s) => !s)} title={sound ? "Sound on" : "Sound off"} style={{ background: "transparent", border: `1px solid ${sound ? C.gold : C.muted}`, color: sound ? C.gold : C.muted, padding: "6px 9px", borderRadius: 8, cursor: "pointer" }}>
              {sound ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
            <Link to="/live-levels" style={{ fontSize: 12, color: C.blue, textDecoration: "none", border: `1px solid ${C.border}`, padding: "5px 10px", borderRadius: 8 }}>Level Terminal</Link>
            <NewsCenter />
            <ThemeToggle />
          </div>
        </div>

        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <div className="os-hide-sb"><AppSidebar /></div>
          <main style={{ flex: 1, minWidth: 0 }}>
            {isFetching ? (
              <div className="os-mono" style={{ fontSize: 11, color: C.gold, marginBottom: 8 }}>⟳ Refreshing live market data…</div>
            ) : null}

            {/* Special alert banner */}
            {data.specialAlert.active ? (
              <div
                className={`os-alert ${data.specialAlert.type === "CALL" ? "os-blink-green" : "os-blink-red"}`}
                style={{
                  borderRadius: 16,
                  padding: "18px 22px",
                  marginBottom: 14,
                  textAlign: "center",
                  background: data.specialAlert.type === "CALL" ? "rgba(16,185,129,0.10)" : "rgba(239,68,68,0.10)",
                }}
              >
                <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: 1, color: data.specialAlert.type === "CALL" ? C.green : C.red }}>
                  {data.specialAlert.type === "CALL" ? "🚀🚀🚀 FOCUS ON CALL" : "🚨🚨🚨 FOCUS ON PUT"}
                </div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
                  All key drivers aligned {data.specialAlert.type === "CALL" ? "bullish" : "bearish"} — high-conviction {data.specialAlert.type === "CALL" ? "call" : "put"} bias
                </div>
              </div>
            ) : null}

            {/* Top summary cards */}
            <div className="os-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", marginBottom: 14 }}>
              <Stat label="NIFTY Live" value={<span className="os-mono">{inr(data.nifty.price)}</span>} color={C.blue} sub={<span style={{ color: data.nifty.change >= 0 ? C.green : C.red }}>{data.nifty.change >= 0 ? "▲" : "▼"} {Math.abs(data.nifty.changePct).toFixed(2)}%</span>} />
              <Stat label="India VIX" value={<span className="os-mono">{data.vix.vix.toFixed(2)}</span>} color={data.vix.tone === "green" ? C.green : data.vix.tone === "yellow" ? C.gold : C.red} sub={data.vix.band + " zone"} />
              <Stat label="A/D Ratio (NSE)" value={<span className="os-mono">{data.nseBreadth.ratio.toFixed(2)}</span>} color={data.nseBreadth.bias === "Bullish" ? C.green : data.nseBreadth.bias === "Bearish" ? C.red : C.gold} sub={`${data.nseBreadth.advances}▲ / ${data.nseBreadth.declines}▼`} />
              <Stat label="A/D Ratio (NIFTY50)" value={<span className="os-mono">{data.niftyBreadth.ratio.toFixed(2)}</span>} color={data.niftyBreadth.bias === "Bullish" ? C.green : data.niftyBreadth.bias === "Bearish" ? C.red : C.gold} sub={`${data.niftyBreadth.advances}▲ / ${data.niftyBreadth.declines}▼`} />
              <Stat label="Top-10 Strength" value={<span className="os-mono">{data.weightedBreadthScore.toFixed(0)}</span>} color={data.top10Bias === "Bullish" ? C.green : data.top10Bias === "Bearish" ? C.red : C.gold} sub={data.top10Bias} />
              <Stat label="PCR" value={<span className="os-mono">{oc.pcr.toFixed(2)}</span>} color={oc.pcr >= 1 ? C.green : C.red} sub={oc.source === "NSE" ? "live chain" : "derived"} />
              <Stat label="Market Breadth" value={data.nseBreadth.label} color={data.nseBreadth.bias === "Bullish" ? C.green : data.nseBreadth.bias === "Bearish" ? C.red : C.gold} />
              <Stat label="Sector Strength" value={<span className="os-mono">{data.sectorStrength.toFixed(0)}</span>} color={data.sectorStrength >= 0 ? C.green : C.red} sub={`${data.sectors.filter((s) => s.changePct >= 0).length}/${data.sectors.length} up`} />
              <Stat label="Recommendation" value={<span style={{ color: recColor }}>{rec.action}</span>} color={recColor} />
              <Stat label="Confidence" value={<span className="os-mono">{rec.confidence.toFixed(0)}%</span>} color={recColor} />
            </div>

            {/* VIX strategy + Recommendation hero */}
            <div className="os-grid" style={{ gridTemplateColumns: "1fr 1.4fr", marginBottom: 14 }}>
              <Card style={{ border: `1px solid ${data.vix.tone === "green" ? C.green : data.vix.tone === "yellow" ? C.gold : C.red}` }}>
                <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 1, display: "flex", alignItems: "center", gap: 6 }}><Gauge size={13} /> India VIX Strategy</div>
                <div className="os-mono" style={{ fontSize: 40, fontWeight: 900, marginTop: 4 }}>{data.vix.vix.toFixed(2)}</div>
                <div
                  style={{
                    display: "inline-block",
                    marginTop: 8,
                    padding: "8px 16px",
                    borderRadius: 10,
                    fontWeight: 900,
                    fontSize: 16,
                    color: "#000",
                    background: data.vix.tone === "green" ? C.green : data.vix.tone === "yellow" ? C.gold : C.red,
                  }}
                >
                  ✅ {data.vix.label}
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>
                  {"<15 → ITM · 15–20 → ATM · >20 → OTM"}
                </div>
              </Card>

              <Card style={{ background: `linear-gradient(135deg, color-mix(in oklab, ${recColor} 16%, transparent), ${C.card})`, border: `1px solid ${recColor}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>Market Decision Engine</div>
                  <span className="os-mono" style={{ fontSize: 10, color: C.muted }}><Radio size={11} style={{ verticalAlign: -1 }} /> every 30s</span>
                </div>
                <div style={{ fontSize: 44, fontWeight: 900, color: recColor, lineHeight: 1.1, marginTop: 4 }}>
                  {rec.action === "BUY CE" ? "🟢" : rec.action === "BUY PE" ? "🔴" : "🟡"} {rec.action}
                </div>
                <div style={{ fontSize: 13, marginTop: 2 }}>Confidence <b>{rec.confidence.toFixed(0)}%</b> · Bull {rec.bullScore}% / Bear {rec.bearScore}%</div>
                <div style={{ height: 8, background: "rgba(255,255,255,0.08)", borderRadius: 4, margin: "8px 0", overflow: "hidden", display: "flex" }}>
                  <div style={{ height: "100%", width: `${rec.bullScore}%`, background: C.green }} />
                  <div style={{ height: "100%", width: `${rec.bearScore}%`, background: C.red }} />
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {rec.reasons.map((r, i) => (
                    <span key={i} className="os-chip">{r}</span>
                  ))}
                </div>
              </Card>
            </div>

            {/* PCR focus cards */}
            <div className="os-grid" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 14 }}>
              <Card className={oc.focus === "CALL" ? "os-blink-green" : undefined} style={{ border: `1px solid ${oc.focus === "CALL" ? C.green : C.border}` }}>
                <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}><Zap size={12} style={{ verticalAlign: -1 }} /> Put OI Build-up</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: oc.focus === "CALL" ? C.green : C.text, marginTop: 4 }}>
                  {oc.focus === "CALL" ? "⚡ FOCUS ON CALL" : "Balanced"}
                </div>
                <div className="os-mono" style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>ΔPut OI {oc.changePutOI.toLocaleString("en-IN")}</div>
              </Card>
              <Card className={oc.focus === "PUT" ? "os-blink-red" : undefined} style={{ border: `1px solid ${oc.focus === "PUT" ? C.red : C.border}` }}>
                <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}><Zap size={12} style={{ verticalAlign: -1 }} /> Call OI Build-up</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: oc.focus === "PUT" ? C.red : C.text, marginTop: 4 }}>
                  {oc.focus === "PUT" ? "⚡ FOCUS ON PUT" : "Balanced"}
                </div>
                <div className="os-mono" style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>ΔCall OI {oc.changeCallOI.toLocaleString("en-IN")}</div>
              </Card>
            </div>

            {/* Advance/Decline analysis */}
            <div className="os-grid" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 14 }}>
              <BreadthCard title="Overall NSE Market" b={data.nseBreadth} total={data.nseBreadth.advances + data.nseBreadth.declines} />
              <BreadthCard title="NIFTY50 Breadth" b={data.niftyBreadth} total={50} />
            </div>

            {/* Top-10 auto-sorting weightage monitor + heatmap */}
            <Top10Widget stocks={data.top10} />

            {/* Sector strength */}
            <SectorStrengthWidget sectors={data.sectors} />

            {/* Option chain */}
            <Card style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1, marginBottom: 12 }}>OPTION CHAIN ANALYSIS {oc.source === "DERIVED" ? <span style={{ fontSize: 10, color: C.muted, fontWeight: 500 }}>(derived proxy)</span> : null}</div>
              <div className="os-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
                <MiniStat label="PCR" value={oc.pcr.toFixed(2)} color={oc.pcr >= 1 ? C.green : C.red} />
                <MiniStat label="Total Call OI" value={oc.totalCallOI.toLocaleString("en-IN")} />
                <MiniStat label="Total Put OI" value={oc.totalPutOI.toLocaleString("en-IN")} />
                <MiniStat label="Highest Call OI" value={oc.highestCallOI.toLocaleString("en-IN")} color={C.red} />
                <MiniStat label="Highest Put OI" value={oc.highestPutOI.toLocaleString("en-IN")} color={C.green} />
                <MiniStat label="Support" value={inr(oc.support)} color={C.green} />
                <MiniStat label="Resistance" value={inr(oc.resistance)} color={C.red} />
                <MiniStat label="OI Focus" value={oc.focus} color={oc.focus === "CALL" ? C.green : oc.focus === "PUT" ? C.red : C.gold} />
              </div>
            </Card>

            {/* Charts */}
            <div className="os-grid" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 14 }}>
              <Card>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>SECTOR STRENGTH CHART</div>
                <SectorChart sectors={data.sectors} />
              </Card>
              <Card>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>TOP-10 CHANGE %</div>
                <TopChart stocks={data.top10} />
              </Card>
            </div>

            {/* AI reasoning panel */}
            <Card style={{ marginBottom: 14, border: `1px solid ${recColor}` }}>
              <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1, marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
                <Activity size={15} /> AI REASONING · {rec.action} · {rec.confidence.toFixed(0)}%
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.9 }}>
                {rec.reasons.map((r, i) => (
                  <li key={i} style={{ color: rec.action === "BUY PE" ? "#f4a6b0" : rec.action === "BUY CE" ? "#a7f3d0" : C.text }}>{r}</li>
                ))}
                <li style={{ color: C.muted }}>Astro bias: {data.astro.bias} ({data.astro.bullCount}▲ / {data.astro.bearCount}▼ · Moon {data.astro.moonNakshatra})</li>
              </ul>
            </Card>

            <div style={{ fontSize: 11, color: C.muted, marginBottom: 12 }} className="os-mono">
              Last updated {lastUpdated} IST · auto-refresh 30s · {oc.source === "NSE" ? "live NSE option chain" : "PCR derived from live breadth & VIX when NSE chain is unreachable"}
            </div>

            <Disclaimer />
          </main>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ subcomponents ------------------------------ */

function Card({ children, style, className }: { children: React.ReactNode; style?: React.CSSProperties; className?: string }) {
  return <div className={`eb-card eb-glass${className ? ` ${className}` : ""}`} style={{ borderRadius: 16, padding: 16, ...style }}>{children}</div>;
}

function Stat({ label, value, color, sub }: { label: string; value: React.ReactNode; color?: string; sub?: React.ReactNode }) {
  return (
    <Card style={{ padding: 14 }}>
      <div style={{ fontSize: 10.5, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: color ?? C.text, marginTop: 4 }} suppressHydrationWarning>{value}</div>
      {sub ? <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }} suppressHydrationWarning>{sub}</div> : null}
    </Card>
  );
}

function MiniStat({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div className="os-mono" style={{ fontSize: 16, fontWeight: 800, color: color ?? C.text, marginTop: 3 }}>{value}</div>
    </div>
  );
}

function BreadthCard({ title, b, total }: { title: string; b: OptionStrategyData["nseBreadth"]; total: number }) {
  const color = b.bias === "Bullish" ? C.green : b.bias === "Bearish" ? C.red : C.gold;
  const advPct = total ? (b.advances / total) * 100 : 50;
  return (
    <Card style={{ borderLeft: `3px solid ${color}` }}>
      <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>{title}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 8 }}>
        <span className="os-mono" style={{ fontSize: 26, fontWeight: 900, color: C.green }}>{b.advances}<span style={{ fontSize: 12, color: C.muted }}> ▲</span></span>
        <span className="os-mono" style={{ fontSize: 26, fontWeight: 900, color: C.red }}>{b.declines}<span style={{ fontSize: 12, color: C.muted }}> ▼</span></span>
      </div>
      <div style={{ height: 8, background: C.red, borderRadius: 4, margin: "8px 0", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${advPct}%`, background: C.green }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
        <span className="os-mono">Ratio <b style={{ color }}>{b.ratio.toFixed(2)}</b></span>
        <span style={{ color, fontWeight: 700 }}>{b.label}</span>
      </div>
    </Card>
  );
}

type SortMode = "change" | "weight" | "impact" | "alpha";

const SORT_LABELS: { value: SortMode; label: string }[] = [
  { value: "change", label: "Change % (Default)" },
  { value: "weight", label: "Weightage %" },
  { value: "impact", label: "Index Impact" },
  { value: "alpha", label: "Alphabetical" },
];

function sortStocks(stocks: TopStock[], mode: SortMode): TopStock[] {
  const arr = [...stocks];
  if (mode === "alpha") {
    arr.sort((a, b) => a.name.localeCompare(b.name));
    return arr;
  }
  arr.sort((a, b) => {
    if (mode === "weight") {
      if (b.weight !== a.weight) return b.weight - a.weight;
    } else if (mode === "impact") {
      if (b.contribution !== a.contribution) return b.contribution - a.contribution;
    } else {
      // change % descending, ties → highest index impact → highest weight
      if (b.changePct !== a.changePct) return b.changePct - a.changePct;
      if (b.contribution !== a.contribution) return b.contribution - a.contribution;
    }
    if (b.weight !== a.weight) return b.weight - a.weight;
    return a.name.localeCompare(b.name);
  });
  return arr;
}

function AnimatedChange({ value }: { value: number }) {
  const prev = useRef(value);
  const [flash, setFlash] = useState<"" | "up" | "dn">("");
  useEffect(() => {
    if (value === prev.current) return;
    setFlash(value > prev.current ? "up" : "dn");
    prev.current = value;
    const id = setTimeout(() => setFlash(""), 700);
    return () => clearTimeout(id);
  }, [value]);
  const up = value >= 0;
  return (
    <span
      className={`os-mono ${flash === "up" ? "os10-flash-up" : flash === "dn" ? "os10-flash-dn" : ""}`}
      style={{ color: up ? C.green : C.red, fontWeight: 700, padding: "1px 4px" }}
    >
      {up ? "▲" : "▼"} {Math.abs(value).toFixed(2)}%
    </span>
  );
}

function Top10Widget({ stocks }: { stocks: TopStock[] }) {
  const [mode, setMode] = useState<SortMode>("change");
  useEffect(() => {
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem("eb-os-top10-sort") : null;
    if (saved && ["change", "weight", "impact", "alpha"].includes(saved)) setMode(saved as SortMode);
  }, []);
  const changeMode = (m: SortMode) => {
    setMode(m);
    if (typeof localStorage !== "undefined") localStorage.setItem("eb-os-top10-sort", m);
  };
  const sorted = useMemo(() => sortStocks(stocks, mode), [stocks, mode]);
  const topSym = mode === "change" && sorted.length ? sorted[0].symbol : null;
  const botSym = mode === "change" && sorted.length ? sorted[sorted.length - 1].symbol : null;

  return (
    <Card style={{ padding: 0, marginBottom: 14 }}>
      <div
        style={{
          padding: "12px 16px",
          borderBottom: `1px solid ${C.border}`,
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ fontWeight: 700, letterSpacing: 1, fontSize: 13 }}>TOP-10 NIFTY WEIGHTAGE (~60% index)</span>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: C.muted }}>
          Sort By
          <select className="os10-select" value={mode} onChange={(e) => changeMode(e.target.value as SortMode)}>
            {SORT_LABELS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div>
        <div className="os10-head">
          <span>Rank</span><span>Stock</span><span>Live</span><span>Change %</span><span>Weight %</span><span>Status</span><span>Impact</span>
        </div>
        <motion.div layout style={{ position: "relative" }}>
          <AnimatePresence initial={false}>
            {sorted.map((t, i) => {
              const isTop = t.symbol === topSym;
              const isBot = t.symbol === botSym;
              const glow = isTop
                ? { border: `1px solid ${C.green}`, boxShadow: "0 0 14px rgba(16,185,129,.35)" }
                : isBot
                  ? { border: `1px solid ${C.red}`, boxShadow: "0 0 14px rgba(239,68,68,.35)" }
                  : {};
              return (
                <motion.div
                  key={t.symbol}
                  layout
                  layoutId={t.symbol}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ layout: { type: "spring", stiffness: 500, damping: 40 }, opacity: { duration: 0.2 } }}
                  className="os10-row"
                  style={glow}
                >
                  <span className="os-mono" style={{ color: C.muted, fontWeight: 700 }}>#{i + 1}</span>
                  <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                    <span style={{ fontWeight: 700 }}>{t.name}</span>
                    {isTop ? <span className="os10-badge" style={{ color: "#0b1420", background: C.gold, marginTop: 2, width: "fit-content" }}>🏆 TOP GAINER</span> : null}
                    {isBot ? <span className="os10-badge" style={{ color: "#fff", background: C.red, marginTop: 2, width: "fit-content" }}>📉 TOP LOSER</span> : null}
                  </span>
                  <span className="os-mono os10-c-live">{inr(t.price)}</span>
                  <span><AnimatedChange value={t.changePct} /></span>
                  <span className="os-mono os10-c-weight">{t.weight.toFixed(1)}</span>
                  <span className="os10-c-status" style={{ color: t.advancing ? C.green : C.red, fontWeight: 700 }}>{t.advancing ? "Advance" : "Decline"}</span>
                  <span className="os-mono os10-c-impact" style={{ color: t.contribution >= 0 ? C.green : C.red }}>{t.contribution >= 0 ? "+" : ""}{t.contribution.toFixed(3)}</span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>
      </div>

      <div style={{ padding: 14 }}>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>LIVE HEATMAP (size ∝ weight · order by Change %)</div>
        <Heatmap stocks={sortStocks(stocks, "change")} />
      </div>
    </Card>
  );
}

function Heatmap({ stocks }: { stocks: TopStock[] }) {
  return (
    <div className="os-heat">
      {stocks.map((s) => {
        const up = s.changePct >= 0;
        const intensity = Math.min(0.85, 0.2 + Math.abs(s.changePct) / 4);
        const flex = Math.max(1, s.weight);
        return (
          <motion.div
            key={s.symbol}
            layout
            transition={{ type: "spring", stiffness: 500, damping: 40 }}
            style={{
              flexGrow: flex,
              borderRadius: 10,
              padding: "12px 10px",
              minHeight: 68,
              background: up ? `rgba(16,185,129,${intensity})` : `rgba(239,68,68,${intensity})`,
              border: `1px solid ${up ? C.green : C.red}`,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 800, color: "#fff" }}>{s.name}</div>
            <div className="os-mono" style={{ fontSize: 13, fontWeight: 800, color: "#fff" }}>{up ? "+" : ""}{s.changePct.toFixed(2)}%</div>
          </motion.div>
        );
      })}
    </div>
  );
}

function SectorChart({ sectors }: { sectors: Sector[] }) {
  const series = useMemo(() => [{ name: "Change %", data: sectors.map((s) => Number(s.changePct.toFixed(2))) }], [sectors]);
  const options = useMemo(
    () => ({
      chart: { toolbar: { show: false } },
      plotOptions: { bar: { horizontal: true, distributed: true, borderRadius: 4 } },
      colors: sectors.map((s) => (s.changePct >= 0 ? "#10b981" : "#ef4444")),
      xaxis: { categories: sectors.map((s) => s.name), labels: { style: { colors: "var(--eb-muted)" } } },
      yaxis: { labels: { style: { colors: "var(--eb-muted)" } } },
      legend: { show: false },
      grid: { borderColor: "rgba(255,255,255,0.06)" },
      dataLabels: { enabled: false },
      tooltip: { theme: "dark" as const },
    }),
    [sectors],
  );
  return <ApexChart type="bar" series={series} options={options as any} height={300} />;
}

function TopChart({ stocks }: { stocks: TopStock[] }) {
  const series = useMemo(() => [{ name: "Change %", data: stocks.map((s) => Number(s.changePct.toFixed(2))) }], [stocks]);
  const options = useMemo(
    () => ({
      chart: { toolbar: { show: false } },
      plotOptions: { bar: { distributed: true, borderRadius: 4, columnWidth: "60%" } },
      colors: stocks.map((s) => (s.changePct >= 0 ? "#10b981" : "#ef4444")),
      xaxis: { categories: stocks.map((s) => s.name), labels: { style: { colors: "var(--eb-muted)" }, rotate: -45 } },
      yaxis: { labels: { style: { colors: "var(--eb-muted)" } } },
      legend: { show: false },
      grid: { borderColor: "rgba(255,255,255,0.06)" },
      dataLabels: { enabled: false },
      tooltip: { theme: "dark" as const },
    }),
    [stocks],
  );
  return <ApexChart type="bar" series={series} options={options as any} height={300} />;
}
