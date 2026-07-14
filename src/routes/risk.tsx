import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, ShieldAlert, Wallet, Gauge, ListChecks, BookOpen, TrendingDown, Trash2 } from "lucide-react";

import { useHydrated } from "@/hooks/use-hydrated";
import { getDecisionSnapshot } from "@/lib/decision.functions";
import {
  defaultsForProfile,
  calcPositionSize,
  suggestStopAndTarget,
  computePortfolioHeat,
  dailyLimitCheck,
  riskMeter,
  positionQuality,
  preTradeChecklist,
  summariseJournal,
  filterJournalByRange,
  type RiskProfile,
  type Direction,
  type OpenPosition,
  type JournalEntry,
  type ProfileDefaults,
  type RiskLevel,
  type QualityGrade,
} from "@/lib/risk-engine";

export const Route = createFileRoute("/risk")({
  component: RiskPage,
  head: () => ({
    meta: [
      { title: "Portfolio & Risk Manager | EagleBABA" },
      {
        name: "description",
        content:
          "Institutional-grade position sizing, portfolio heat, daily limits, checklist, and trade journal for EagleBABA. Additive to the Decision Engine — never overrides existing formulas.",
      },
      { property: "og:title", content: "Portfolio & Risk Manager | EagleBABA" },
      {
        property: "og:description",
        content:
          "Sizing, stop suggestion, portfolio heat, daily loss caps, quality grading and journal.",
      },
    ],
  }),
});

const LOT_SIZE: Record<string, number> = { NIFTY: 75, BANKNIFTY: 30 };

type Settings = {
  profile: RiskProfile;
  capital: number;
  riskPct: number;
  brokeragePerLot: number;
  slippagePerUnit: number;
  minRR: number;
  maxDailyLossPct: number;
  maxTradesPerDay: number;
};

const DEFAULT_SETTINGS: Settings = {
  profile: "MODERATE",
  capital: 500_000,
  riskPct: 1,
  brokeragePerLot: 40,
  slippagePerUnit: 0.5,
  minRR: 1.5,
  maxDailyLossPct: 3,
  maxTradesPerDay: 5,
};

const LS = {
  settings: "eb-risk-settings-v1",
  positions: "eb-risk-positions-v1",
  journal: "eb-risk-journal-v1",
  stats: "eb-risk-stats-v1",
};

function readLS<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const v = window.localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeLS<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch { /* ignore quota */ }
}

function RiskPage() {
  const hydrated = useHydrated();
  if (!hydrated) return <div style={{ padding: 24, color: "var(--eb-muted)" }}>Loading risk workstation…</div>;
  return <RiskWorkstation />;
}

function RiskWorkstation() {
  const [settings, setSettings] = useState<Settings>(() => readLS(LS.settings, DEFAULT_SETTINGS));
  const [positions, setPositions] = useState<OpenPosition[]>(() => readLS(LS.positions, []));
  const [journal, setJournal] = useState<JournalEntry[]>(() => readLS(LS.journal, []));
  const defaults: ProfileDefaults = useMemo(() => {
    const d = defaultsForProfile(settings.profile);
    return settings.profile === "CUSTOM" ? { ...d, riskPctPerTrade: settings.riskPct } : d;
  }, [settings.profile, settings.riskPct]);

  // Sync settings.riskPct with profile default when profile changes (unless CUSTOM).
  useEffect(() => {
    if (settings.profile !== "CUSTOM") {
      setSettings((s) => ({ ...s, riskPct: defaults.riskPctPerTrade }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.profile]);

  useEffect(() => writeLS(LS.settings, settings), [settings]);
  useEffect(() => writeLS(LS.positions, positions), [positions]);
  useEffect(() => writeLS(LS.journal, journal), [journal]);

  const decisionQ = useQuery({
    queryKey: ["decision-snapshot"],
    queryFn: () => getDecisionSnapshot(),
    refetchInterval: 60_000,
  });

  const decision = decisionQ.data?.decision;
  const decisionConfidence = decision?.confidence ?? 0;
  const conflicts = decision?.conflicts.length ?? 0;
  const decisionBias: "BULL" | "BEAR" | "NEUTRAL" =
    decision?.action === "STRONG_BUY_CE" || decision?.action === "BUY_CE"
      ? "BULL"
      : decision?.action === "STRONG_BUY_PE" || decision?.action === "BUY_PE"
        ? "BEAR"
        : "NEUTRAL";
  const optionsAgreement =
    !!decision?.contributions.find(
      (c) => c.key === "options" && c.present && c.bias === decisionBias,
    );
  const historicalAcc: number | null = null;

  // ── Trade builder state ─────────────────────────────────────────
  const [symbol, setSymbol] = useState<"NIFTY" | "BANKNIFTY">("NIFTY");
  const [direction, setDirection] = useState<Direction>("LONG");
  const [entry, setEntry] = useState<number>(24000);
  const [stopLoss, setStopLoss] = useState<number>(23900);
  const [supportsText, setSupportsText] = useState("23900, 23800");
  const [resistancesText, setResistancesText] = useState("24100, 24250");

  const supports = parseNumberList(supportsText);
  const resistances = parseNumberList(resistancesText);
  const stopSuggest = suggestStopAndTarget({
    entry,
    direction,
    supports,
    resistances,
    minRiskReward: settings.minRR,
  });

  const position = calcPositionSize({
    capital: settings.capital,
    riskPct: settings.riskPct,
    entry,
    stopLoss,
    lotSize: LOT_SIZE[symbol],
    brokeragePerLot: settings.brokeragePerLot,
    slippagePerUnit: settings.slippagePerUnit,
  });

  // ── Portfolio heat ─────────────────────────────────────────────
  const heat = computePortfolioHeat(positions, settings.capital, defaults.dailyRiskPct);

  // ── Daily stats (derived from today's journal entries) ─────────
  const todays = filterJournalByRange(journal, "DAILY");
  const wins = todays.filter((e) => e.outcome === "WIN").length;
  const losses = todays.filter((e) => e.outcome === "LOSS").length;
  const pnl = todays.reduce((s, e) => s + (e.pnl ?? 0), 0);
  const riskUsed = todays.reduce((s, e) => s + e.riskAmount, 0);
  const dailyStats = { trades: todays.length, wins, losses, pnl, riskUsed };
  const daily = dailyLimitCheck(dailyStats, {
    capital: settings.capital,
    dailyRiskPct: defaults.dailyRiskPct,
    maxTradesPerDay: settings.maxTradesPerDay,
    maxDailyLossPct: settings.maxDailyLossPct,
  });

  const sameDir = positions.filter((p) => p.direction === direction).length;
  const checklist = preTradeChecklist({
    position,
    heat,
    daily,
    defaults,
    openPositions: positions.length,
    sameDirectionOpen: sameDir,
    decisionConfidence,
    riskReward: stopSuggest.riskReward,
    minRiskReward: settings.minRR,
  });

  const quality = positionQuality({
    decisionConfidence,
    historicalAccuracy: historicalAcc,
    optionsAgreement,
    riskReward: stopSuggest.riskReward,
    riskPct: settings.riskPct,
  });

  const riskLevel = riskMeter(heat.usedRiskPct, defaults.dailyRiskPct, conflicts);

  // ── Handlers ───────────────────────────────────────────────────
  function addOpenPosition() {
    if (!position.valid) return;
    const p: OpenPosition = {
      id: crypto.randomUUID(),
      symbol,
      sector: symbol === "BANKNIFTY" ? "BANK" : "INDEX",
      direction,
      riskAmount: position.netRiskAmount,
      capitalUsed: position.capitalUsed,
    };
    setPositions((prev) => [...prev, p]);
  }

  function closePosition(id: string, outcome: "WIN" | "LOSS" | "BREAKEVEN", pnlValue: number) {
    const p = positions.find((x) => x.id === id);
    if (!p) return;
    setPositions((prev) => prev.filter((x) => x.id !== id));
    const entryVal = entry;
    const entryRec: JournalEntry = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      symbol: p.symbol,
      direction: p.direction,
      entry: entryVal,
      exit: null,
      quantity: Math.round(p.capitalUsed / Math.max(1, entryVal)),
      pnl: pnlValue,
      reason: `${decision?.action ?? "MANUAL"} · confidence ${decisionConfidence}`,
      decisionAction: decision?.action,
      confidence: decisionConfidence,
      riskAmount: p.riskAmount,
      outcome,
    };
    setJournal((prev) => [entryRec, ...prev]);
  }

  function addJournalManual(entry: JournalEntry) {
    setJournal((prev) => [entry, ...prev]);
  }

  const weekly = summariseJournal(filterJournalByRange(journal, "WEEKLY"));
  const monthly = summariseJournal(filterJournalByRange(journal, "MONTHLY"));
  const dailySummary = summariseJournal(todays);

  return (
    <div className="eb-page" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 20 }}>
      <PageHeader riskLevel={riskLevel} daily={daily} />

      <div style={grid2}>
        <SettingsCard settings={settings} setSettings={setSettings} defaults={defaults} />
        <TradeBuilder
          symbol={symbol}
          setSymbol={setSymbol}
          direction={direction}
          setDirection={setDirection}
          entry={entry}
          setEntry={setEntry}
          stopLoss={stopLoss}
          setStopLoss={setStopLoss}
          supportsText={supportsText}
          setSupportsText={setSupportsText}
          resistancesText={resistancesText}
          setResistancesText={setResistancesText}
          stopSuggest={stopSuggest}
          onApplySuggestion={() => {
            if (stopSuggest.stop != null) setStopLoss(stopSuggest.stop);
          }}
        />
      </div>

      <div style={grid2}>
        <PositionCard position={position} quality={quality} decision={decision?.action ?? "—"} confidence={decisionConfidence} />
        <PortfolioHeatCard heat={heat} riskLevel={riskLevel} defaults={defaults} />
      </div>

      <ChecklistCard checklist={checklist} onCommit={addOpenPosition} disabled={!checklist.allPass || daily.stopTrading} />

      <OpenPositionsCard positions={positions} onClose={closePosition} />

      <DailyLimitsCard stats={dailyStats} daily={daily} settings={settings} defaults={defaults} />

      <JournalCard journal={journal} onAdd={addJournalManual} onClear={() => setJournal([])} />

      <ReportsCard daily={dailySummary} weekly={weekly} monthly={monthly} />
    </div>
  );
}

// ── Layout helpers ───────────────────────────────────────────────
const cardStyle: React.CSSProperties = {
  background: "var(--eb-card)",
  border: "1px solid var(--eb-border)",
  borderRadius: 12,
  padding: 16,
  color: "var(--eb-text)",
};
const grid2: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 16,
};
const label: React.CSSProperties = { fontSize: 12, color: "var(--eb-muted)", marginBottom: 4, display: "block" };
const input: React.CSSProperties = {
  width: "100%",
  background: "var(--eb-bg)",
  border: "1px solid var(--eb-border)",
  color: "var(--eb-text)",
  padding: "8px 10px",
  borderRadius: 8,
};
const btn: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid var(--eb-border)",
  background: "var(--eb-blue)",
  color: "white",
  cursor: "pointer",
  fontWeight: 600,
};
const btnGhost: React.CSSProperties = { ...btn, background: "transparent", color: "var(--eb-text)" };

// ── Sub-components ──────────────────────────────────────────────
function PageHeader({ riskLevel, daily }: { riskLevel: RiskLevel; daily: ReturnType<typeof dailyLimitCheck> }) {
  const riskColor: Record<RiskLevel, string> = {
    LOW: "var(--eb-bull)",
    MEDIUM: "var(--eb-accent)",
    HIGH: "#ff9800",
    CRITICAL: "var(--eb-bear)",
  };
  return (
    <header style={{ ...cardStyle, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22, display: "flex", alignItems: "center", gap: 8 }}>
          <ShieldCheck size={22} /> Portfolio &amp; Risk Manager
        </h1>
        <p style={{ margin: "4px 0 0", color: "var(--eb-muted)", fontSize: 13 }}>
          Position sizing · portfolio heat · daily limits · journal — reuses the Decision Engine, never overrides it.
        </p>
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{ padding: "6px 12px", borderRadius: 8, background: riskColor[riskLevel], color: "white", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
          <Gauge size={16} /> Risk: {riskLevel}
        </div>
        {daily.stopTrading && (
          <div style={{ padding: "6px 12px", borderRadius: 8, background: "var(--eb-bear)", color: "white", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
            <ShieldAlert size={16} /> STOP TRADING TODAY
          </div>
        )}
      </div>
    </header>
  );
}

function SettingsCard({ settings, setSettings, defaults }: {
  settings: Settings;
  setSettings: React.Dispatch<React.SetStateAction<Settings>>;
  defaults: ProfileDefaults;
}) {
  const upd = <K extends keyof Settings>(k: K, v: Settings[K]) => setSettings((s) => ({ ...s, [k]: v }));
  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0, fontSize: 16, display: "flex", gap: 6, alignItems: "center" }}><Wallet size={16} /> Account Settings</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
        <div>
          <label style={label}>Risk Profile</label>
          <select style={input} value={settings.profile} onChange={(e) => upd("profile", e.target.value as RiskProfile)}>
            <option value="CONSERVATIVE">Conservative</option>
            <option value="MODERATE">Moderate</option>
            <option value="AGGRESSIVE">Aggressive</option>
            <option value="CUSTOM">Custom</option>
          </select>
        </div>
        <NumField label="Trading Capital (₹)" value={settings.capital} onChange={(v) => upd("capital", v)} />
        <NumField label="Risk % per trade" value={settings.riskPct} step={0.1} onChange={(v) => upd("riskPct", v)} disabled={settings.profile !== "CUSTOM"} />
        <NumField label="Brokerage / lot (₹)" value={settings.brokeragePerLot} onChange={(v) => upd("brokeragePerLot", v)} />
        <NumField label="Slippage / unit (₹)" value={settings.slippagePerUnit} step={0.1} onChange={(v) => upd("slippagePerUnit", v)} />
        <NumField label="Min Risk-Reward" value={settings.minRR} step={0.1} onChange={(v) => upd("minRR", v)} />
        <NumField label="Max Daily Loss %" value={settings.maxDailyLossPct} step={0.1} onChange={(v) => upd("maxDailyLossPct", v)} />
        <NumField label="Max Trades / Day" value={settings.maxTradesPerDay} onChange={(v) => upd("maxTradesPerDay", v)} />
      </div>
      <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: "var(--eb-bg)", border: "1px solid var(--eb-border)", fontSize: 12, color: "var(--eb-muted)" }}>
        Profile budget · Daily {defaults.dailyRiskPct}% · Weekly {defaults.weeklyRiskPct}% · Monthly {defaults.monthlyRiskPct}% · Max open {defaults.maxOpenTrades} · Same-direction {defaults.maxSameDirection} · Min confidence {defaults.minConfidence}
      </div>
    </section>
  );
}

function NumField({ label: L, value, onChange, step = 1, disabled }: { label: string; value: number; onChange: (v: number) => void; step?: number; disabled?: boolean }) {
  return (
    <div>
      <label style={label}>{L}</label>
      <input type="number" style={{ ...input, opacity: disabled ? 0.6 : 1 }} value={value} step={step} disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value) || 0)} />
    </div>
  );
}

function TradeBuilder(props: {
  symbol: "NIFTY" | "BANKNIFTY"; setSymbol: (v: "NIFTY" | "BANKNIFTY") => void;
  direction: Direction; setDirection: (d: Direction) => void;
  entry: number; setEntry: (n: number) => void;
  stopLoss: number; setStopLoss: (n: number) => void;
  supportsText: string; setSupportsText: (s: string) => void;
  resistancesText: string; setResistancesText: (s: string) => void;
  stopSuggest: ReturnType<typeof suggestStopAndTarget>;
  onApplySuggestion: () => void;
}) {
  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0, fontSize: 16 }}>Trade Builder</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
        <div>
          <label style={label}>Symbol</label>
          <select style={input} value={props.symbol} onChange={(e) => props.setSymbol(e.target.value as "NIFTY" | "BANKNIFTY")}>
            <option value="NIFTY">NIFTY (lot 75)</option>
            <option value="BANKNIFTY">BANK NIFTY (lot 30)</option>
          </select>
        </div>
        <div>
          <label style={label}>Direction</label>
          <select style={input} value={props.direction} onChange={(e) => props.setDirection(e.target.value as Direction)}>
            <option value="LONG">LONG (BUY CE)</option>
            <option value="SHORT">SHORT (BUY PE)</option>
          </select>
        </div>
        <NumField label="Entry" value={props.entry} step={0.05} onChange={props.setEntry} />
        <NumField label="Stop Loss" value={props.stopLoss} step={0.05} onChange={props.setStopLoss} />
        <div>
          <label style={label}>Supports (comma-sep)</label>
          <input style={input} value={props.supportsText} onChange={(e) => props.setSupportsText(e.target.value)} />
        </div>
        <div>
          <label style={label}>Resistances (comma-sep)</label>
          <input style={input} value={props.resistancesText} onChange={(e) => props.setResistancesText(e.target.value)} />
        </div>
      </div>
      <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: "var(--eb-bg)", border: "1px solid var(--eb-border)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13 }}>
          <strong>Stop suggestion:</strong>{" "}
          {props.stopSuggest.stop != null ? (
            <>SL {props.stopSuggest.stop} · Target {props.stopSuggest.target} · RR {props.stopSuggest.riskReward} <span style={{ color: "var(--eb-muted)" }}>({props.stopSuggest.note})</span></>
          ) : (
            <span style={{ color: "var(--eb-bear)" }}>{props.stopSuggest.note}</span>
          )}
        </div>
        <button style={btnGhost} onClick={props.onApplySuggestion} disabled={props.stopSuggest.stop == null}>Apply SL</button>
      </div>
    </section>
  );
}

function PositionCard({ position, quality, decision, confidence }: {
  position: ReturnType<typeof calcPositionSize>;
  quality: { grade: QualityGrade; score: number };
  decision: string; confidence: number;
}) {
  const gradeColor: Record<QualityGrade, string> = {
    "A+": "var(--eb-bull)", A: "var(--eb-bull)", B: "var(--eb-accent)", C: "#ff9800", D: "var(--eb-bear)",
  };
  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0, fontSize: 16 }}>Position Size</h2>
      {position.valid ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, fontSize: 14 }}>
          <Row k="Quantity" v={position.quantity.toLocaleString()} />
          <Row k="Lots" v={position.lots.toString()} />
          <Row k="Risk / unit" v={`₹${position.perUnitRisk.toFixed(2)}`} />
          <Row k="Risk Amount" v={`₹${Math.round(position.netRiskAmount).toLocaleString()}`} />
          <Row k="Capital Used" v={`₹${Math.round(position.capitalUsed).toLocaleString()}`} />
          <Row k="Margin Est." v={`₹${Math.round(position.marginRequired).toLocaleString()}`} />
          <Row k="Brokerage" v={`₹${Math.round(position.brokerage).toLocaleString()}`} />
          <Row k="Slippage" v={`₹${Math.round(position.slippageCost).toLocaleString()}`} />
        </div>
      ) : (
        <div style={{ color: "var(--eb-bear)" }}>{position.reason ?? "Invalid setup"}</div>
      )}
      <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: "var(--eb-bg)", border: "1px solid var(--eb-border)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 13, color: "var(--eb-muted)" }}>Decision: <strong style={{ color: "var(--eb-text)" }}>{decision}</strong> · Confidence {confidence}</div>
        <div style={{ padding: "6px 12px", background: gradeColor[quality.grade], color: "white", borderRadius: 8, fontWeight: 700 }}>Quality {quality.grade} · {quality.score}</div>
      </div>
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px dashed var(--eb-border)" }}>
      <span style={{ color: "var(--eb-muted)" }}>{k}</span><strong>{v}</strong>
    </div>
  );
}

function PortfolioHeatCard({ heat, riskLevel, defaults }: { heat: ReturnType<typeof computePortfolioHeat>; riskLevel: RiskLevel; defaults: ProfileDefaults }) {
  const pct = Math.min(100, (heat.usedRisk / Math.max(1, heat.dailyCap)) * 100);
  const barColor = riskLevel === "CRITICAL" ? "var(--eb-bear)" : riskLevel === "HIGH" ? "#ff9800" : riskLevel === "MEDIUM" ? "var(--eb-accent)" : "var(--eb-bull)";
  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0, fontSize: 16 }}>Portfolio Heat</h2>
      <div style={{ height: 10, background: "var(--eb-bg)", borderRadius: 5, overflow: "hidden", border: "1px solid var(--eb-border)" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: barColor, transition: "width .3s" }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, marginTop: 12, fontSize: 14 }}>
        <Row k="Used Risk" v={`₹${Math.round(heat.usedRisk).toLocaleString()}`} />
        <Row k="Daily Cap" v={`₹${Math.round(heat.dailyCap).toLocaleString()}`} />
        <Row k="Remaining" v={`₹${Math.round(heat.remainingRisk).toLocaleString()}`} />
        <Row k="Exposure" v={`₹${Math.round(heat.exposure).toLocaleString()} (${heat.exposurePct.toFixed(1)}%)`} />
        <Row k="Long Risk" v={`₹${Math.round(heat.directionalExposure.long).toLocaleString()}`} />
        <Row k="Short Risk" v={`₹${Math.round(heat.directionalExposure.short).toLocaleString()}`} />
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: "var(--eb-muted)" }}>
        Budget: Daily {defaults.dailyRiskPct}% · Weekly {defaults.weeklyRiskPct}% · Monthly {defaults.monthlyRiskPct}%
      </div>
      {Object.keys(heat.sectorExposure).length > 0 && (
        <div style={{ marginTop: 8, fontSize: 12 }}>
          <strong>Sectors:</strong>{" "}
          {Object.entries(heat.sectorExposure).map(([k, v]) => `${k} ₹${Math.round(v).toLocaleString()}`).join(" · ")}
        </div>
      )}
    </section>
  );
}

function ChecklistCard({ checklist, onCommit, disabled }: { checklist: ReturnType<typeof preTradeChecklist>; onCommit: () => void; disabled: boolean }) {
  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0, fontSize: 16, display: "flex", alignItems: "center", gap: 6 }}><ListChecks size={16} /> Pre-Trade Checklist</h2>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 8 }}>
        {checklist.items.map((it) => (
          <li key={it.key} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: 10, background: "var(--eb-bg)", border: "1px solid var(--eb-border)", borderRadius: 8 }}>
            <span style={{ color: it.pass ? "var(--eb-bull)" : "var(--eb-bear)", fontWeight: 700, fontSize: 16 }}>{it.pass ? "✔" : "✕"}</span>
            <div>
              <div style={{ fontWeight: 600 }}>{it.label}</div>
              {it.detail && <div style={{ fontSize: 12, color: "var(--eb-muted)" }}>{it.detail}</div>}
            </div>
          </li>
        ))}
      </ul>
      <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button style={{ ...btn, opacity: disabled ? 0.5 : 1, cursor: disabled ? "not-allowed" : "pointer" }} onClick={onCommit} disabled={disabled}>
          Commit as Open Position
        </button>
      </div>
    </section>
  );
}

function OpenPositionsCard({ positions, onClose }: { positions: OpenPosition[]; onClose: (id: string, outcome: "WIN" | "LOSS" | "BREAKEVEN", pnl: number) => void }) {
  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0, fontSize: 16 }}>Open Positions ({positions.length})</h2>
      {positions.length === 0 ? (
        <div style={{ color: "var(--eb-muted)", fontSize: 13 }}>No open positions.</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ color: "var(--eb-muted)", textAlign: "left" }}>
              <th>Symbol</th><th>Dir</th><th>Risk</th><th>Exposure</th><th>Sector</th><th>Close</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => (
              <tr key={p.id} style={{ borderTop: "1px solid var(--eb-border)" }}>
                <td>{p.symbol}</td>
                <td>{p.direction}</td>
                <td>₹{Math.round(p.riskAmount).toLocaleString()}</td>
                <td>₹{Math.round(p.capitalUsed).toLocaleString()}</td>
                <td>{p.sector}</td>
                <td style={{ display: "flex", gap: 4, padding: "6px 0" }}>
                  <button style={{ ...btnGhost, padding: "4px 8px" }} onClick={() => onClose(p.id, "WIN", p.riskAmount * 1.5)}>Win</button>
                  <button style={{ ...btnGhost, padding: "4px 8px" }} onClick={() => onClose(p.id, "LOSS", -p.riskAmount)}>Loss</button>
                  <button style={{ ...btnGhost, padding: "4px 8px" }} onClick={() => onClose(p.id, "BREAKEVEN", 0)}>BE</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function DailyLimitsCard({ stats, daily, settings, defaults }: { stats: { trades: number; wins: number; losses: number; pnl: number; riskUsed: number }; daily: ReturnType<typeof dailyLimitCheck>; settings: Settings; defaults: ProfileDefaults }) {
  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0, fontSize: 16, display: "flex", alignItems: "center", gap: 6 }}><TrendingDown size={16} /> Daily Tracker</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        <Metric k="Trades" v={`${stats.trades} / ${settings.maxTradesPerDay}`} />
        <Metric k="Wins" v={stats.wins.toString()} />
        <Metric k="Losses" v={stats.losses.toString()} />
        <Metric k="PnL" v={`₹${Math.round(stats.pnl).toLocaleString()}`} bad={stats.pnl < 0} good={stats.pnl > 0} />
        <Metric k="Risk Used" v={`${daily.riskUsedPct.toFixed(2)}% / ${defaults.dailyRiskPct}%`} />
        <Metric k="Loss %" v={`${daily.lossPct.toFixed(2)}% / -${settings.maxDailyLossPct}%`} />
      </div>
      {daily.reasons.length > 0 && (
        <div style={{ marginTop: 10, padding: 10, background: "rgba(255,0,0,0.08)", border: "1px solid var(--eb-bear)", borderRadius: 8, color: "var(--eb-bear)", fontSize: 13 }}>
          <strong>STOP TRADING TODAY:</strong> {daily.reasons.join(" · ")}
        </div>
      )}
    </section>
  );
}

function Metric({ k, v, good, bad }: { k: string; v: string; good?: boolean; bad?: boolean }) {
  return (
    <div style={{ padding: 10, background: "var(--eb-bg)", border: "1px solid var(--eb-border)", borderRadius: 8 }}>
      <div style={{ fontSize: 11, color: "var(--eb-muted)" }}>{k}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: good ? "var(--eb-bull)" : bad ? "var(--eb-bear)" : "var(--eb-text)" }}>{v}</div>
    </div>
  );
}

function JournalCard({ journal, onAdd, onClear }: { journal: JournalEntry[]; onAdd: (e: JournalEntry) => void; onClear: () => void }) {
  const [symbol, setSymbol] = useState("NIFTY");
  const [dir, setDir] = useState<Direction>("LONG");
  const [entry, setEntry] = useState(0);
  const [exit, setExit] = useState(0);
  const [qty, setQty] = useState(75);
  const [outcome, setOutcome] = useState<"WIN" | "LOSS" | "BREAKEVEN">("WIN");
  const [reason, setReason] = useState("");
  const [lessons, setLessons] = useState("");

  const submit = () => {
    const pnl = (dir === "LONG" ? exit - entry : entry - exit) * qty;
    onAdd({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      symbol,
      direction: dir,
      entry,
      exit,
      quantity: qty,
      pnl,
      reason,
      riskAmount: Math.abs(pnl),
      outcome,
      lessons,
    });
    setEntry(0); setExit(0); setReason(""); setLessons("");
  };

  return (
    <section style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ marginTop: 0, fontSize: 16, display: "flex", alignItems: "center", gap: 6 }}><BookOpen size={16} /> Trade Journal ({journal.length})</h2>
        {journal.length > 0 && (
          <button style={btnGhost} onClick={() => { if (confirm("Clear all journal entries?")) onClear(); }}>
            <Trash2 size={14} /> Clear
          </button>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginTop: 8 }}>
        <div><label style={label}>Symbol</label><input style={input} value={symbol} onChange={(e) => setSymbol(e.target.value)} /></div>
        <div><label style={label}>Direction</label>
          <select style={input} value={dir} onChange={(e) => setDir(e.target.value as Direction)}>
            <option value="LONG">LONG</option><option value="SHORT">SHORT</option>
          </select>
        </div>
        <NumField label="Entry" value={entry} step={0.05} onChange={setEntry} />
        <NumField label="Exit" value={exit} step={0.05} onChange={setExit} />
        <NumField label="Qty" value={qty} onChange={setQty} />
        <div><label style={label}>Outcome</label>
          <select style={input} value={outcome} onChange={(e) => setOutcome(e.target.value as "WIN" | "LOSS" | "BREAKEVEN")}>
            <option value="WIN">Win</option><option value="LOSS">Loss</option><option value="BREAKEVEN">Breakeven</option>
          </select>
        </div>
      </div>
      <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "end" }}>
        <div><label style={label}>Reason / decision</label><input style={input} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Astro BULL confluence" /></div>
        <div><label style={label}>Lessons</label><input style={input} value={lessons} onChange={(e) => setLessons(e.target.value)} placeholder="What to remember" /></div>
        <button style={btn} onClick={submit}>Add Entry</button>
      </div>
      {journal.length > 0 && (
        <div style={{ marginTop: 12, maxHeight: 260, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ color: "var(--eb-muted)", textAlign: "left" }}>
                <th>When</th><th>Symbol</th><th>Dir</th><th>Entry</th><th>Exit</th><th>PnL</th><th>Outcome</th><th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {journal.slice(0, 50).map((e) => (
                <tr key={e.id} style={{ borderTop: "1px solid var(--eb-border)" }}>
                  <td>{new Date(e.createdAt).toLocaleString()}</td>
                  <td>{e.symbol}</td>
                  <td>{e.direction}</td>
                  <td>{e.entry}</td>
                  <td>{e.exit ?? "—"}</td>
                  <td style={{ color: (e.pnl ?? 0) >= 0 ? "var(--eb-bull)" : "var(--eb-bear)" }}>₹{Math.round(e.pnl ?? 0).toLocaleString()}</td>
                  <td>{e.outcome}</td>
                  <td>{e.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ReportsCard({ daily, weekly, monthly }: { daily: ReturnType<typeof summariseJournal>; weekly: ReturnType<typeof summariseJournal>; monthly: ReturnType<typeof summariseJournal> }) {
  const cols: { title: string; r: ReturnType<typeof summariseJournal> }[] = [
    { title: "Daily", r: daily }, { title: "Weekly", r: weekly }, { title: "Monthly", r: monthly },
  ];
  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0, fontSize: 16 }}>Reports</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
        {cols.map((c) => (
          <div key={c.title} style={{ padding: 12, background: "var(--eb-bg)", border: "1px solid var(--eb-border)", borderRadius: 8 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>{c.title}</div>
            <Row k="Trades" v={c.r.trades.toString()} />
            <Row k="Win rate" v={`${c.r.winRatePct.toFixed(1)}%`} />
            <Row k="PnL" v={`₹${Math.round(c.r.totalPnl).toLocaleString()}`} />
            <Row k="Avg win" v={`₹${Math.round(c.r.avgWin).toLocaleString()}`} />
            <Row k="Avg loss" v={`₹${Math.round(c.r.avgLoss).toLocaleString()}`} />
            <Row k="Expectancy" v={`₹${Math.round(c.r.expectancy).toLocaleString()}`} />
            <Row k="Profit factor" v={Number.isFinite(c.r.profitFactor) ? c.r.profitFactor.toFixed(2) : "∞"} />
          </div>
        ))}
      </div>
    </section>
  );
}

function parseNumberList(txt: string): number[] {
  return txt.split(/[,\s]+/).map((t) => Number(t.trim())).filter((n) => Number.isFinite(n) && n > 0);
}