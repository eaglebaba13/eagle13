// Phase 18 — Portfolio & Risk Management Engine (pure, deterministic).
//
// This module is ADDITIVE. It consumes outputs from the Decision Engine
// and Options Analytics; it never recomputes Astro / Signal / S-R /
// Backtest / Replay formulas. Every function is pure and side-effect
// free so it can be unit-tested deterministically.

export type RiskProfile = "CONSERVATIVE" | "MODERATE" | "AGGRESSIVE" | "CUSTOM";

export type ProfileDefaults = {
  riskPctPerTrade: number; // % of capital risked per single trade
  dailyRiskPct: number;
  weeklyRiskPct: number;
  monthlyRiskPct: number;
  maxOpenTrades: number;
  maxSameDirection: number;
  minConfidence: number; // decision confidence gate (0..100)
  maxOvernightRiskPct: number;
};

export const PROFILE_DEFAULTS: Record<Exclude<RiskProfile, "CUSTOM">, ProfileDefaults> = {
  CONSERVATIVE: {
    riskPctPerTrade: 0.5,
    dailyRiskPct: 1.5,
    weeklyRiskPct: 3,
    monthlyRiskPct: 6,
    maxOpenTrades: 2,
    maxSameDirection: 1,
    minConfidence: 75,
    maxOvernightRiskPct: 0.5,
  },
  MODERATE: {
    riskPctPerTrade: 1,
    dailyRiskPct: 3,
    weeklyRiskPct: 6,
    monthlyRiskPct: 12,
    maxOpenTrades: 3,
    maxSameDirection: 2,
    minConfidence: 65,
    maxOvernightRiskPct: 1,
  },
  AGGRESSIVE: {
    riskPctPerTrade: 2,
    dailyRiskPct: 5,
    weeklyRiskPct: 10,
    monthlyRiskPct: 20,
    maxOpenTrades: 5,
    maxSameDirection: 3,
    minConfidence: 55,
    maxOvernightRiskPct: 2,
  },
};

export function defaultsForProfile(p: RiskProfile): ProfileDefaults {
  if (p === "CUSTOM") return PROFILE_DEFAULTS.MODERATE;
  return PROFILE_DEFAULTS[p];
}

// ─────────────────────────────────────────────────────────────
// Position sizing
// ─────────────────────────────────────────────────────────────

export type PositionInput = {
  capital: number;
  riskPct: number; // per-trade
  entry: number;
  stopLoss: number;
  lotSize: number; // e.g. NIFTY = 75
  brokeragePerLot?: number;
  slippagePerUnit?: number;
  marginPerLot?: number;
};

export type PositionResult = {
  perUnitRisk: number;
  riskAmount: number;
  quantity: number;
  lots: number;
  capitalUsed: number;
  marginRequired: number;
  brokerage: number;
  slippageCost: number;
  netRiskAmount: number;
  valid: boolean;
  reason?: string;
};

export function calcPositionSize(inp: PositionInput): PositionResult {
  const zero: PositionResult = {
    perUnitRisk: 0,
    riskAmount: 0,
    quantity: 0,
    lots: 0,
    capitalUsed: 0,
    marginRequired: 0,
    brokerage: 0,
    slippageCost: 0,
    netRiskAmount: 0,
    valid: false,
  };
  if (inp.capital <= 0) return { ...zero, reason: "Capital must be positive" };
  if (inp.riskPct <= 0) return { ...zero, reason: "Risk % must be positive" };
  if (inp.lotSize <= 0) return { ...zero, reason: "Invalid lot size" };
  const perUnit = Math.abs(inp.entry - inp.stopLoss);
  if (perUnit <= 0) return { ...zero, reason: "Stop loss must differ from entry" };

  const slip = Math.max(0, inp.slippagePerUnit ?? 0);
  const perUnitRisk = perUnit + slip;
  const riskAmount = (inp.capital * inp.riskPct) / 100;
  const rawQty = riskAmount / perUnitRisk;
  const lots = Math.max(0, Math.floor(rawQty / inp.lotSize));
  const quantity = lots * inp.lotSize;
  const brokerage = lots * (inp.brokeragePerLot ?? 0);
  const slippageCost = quantity * slip;
  const marginRequired = lots * (inp.marginPerLot ?? inp.entry * inp.lotSize);
  const capitalUsed = quantity * inp.entry;
  const netRiskAmount = quantity * perUnit + brokerage + slippageCost;

  return {
    perUnitRisk,
    riskAmount,
    quantity,
    lots,
    capitalUsed,
    marginRequired,
    brokerage,
    slippageCost,
    netRiskAmount,
    valid: quantity > 0,
    reason: quantity > 0 ? undefined : "Risk budget too small for one lot",
  };
}

// ─────────────────────────────────────────────────────────────
// Stop / target suggestion (reuses caller-supplied levels)
// ─────────────────────────────────────────────────────────────

export type Direction = "LONG" | "SHORT";

export type StopTargetInput = {
  entry: number;
  direction: Direction;
  supports: number[]; // sorted asc or unsorted
  resistances: number[];
  minRiskReward?: number; // default 1.5
  bufferPct?: number; // default 0.1% cushion beyond nearest level
};

export type StopTargetResult = {
  stop: number | null;
  target: number | null;
  riskReward: number | null;
  usedLevel: number | null;
  note: string;
};

export function suggestStopAndTarget(inp: StopTargetInput): StopTargetResult {
  const buffer = (inp.bufferPct ?? 0.1) / 100;
  const minRR = inp.minRiskReward ?? 1.5;
  const sups = [...inp.supports].filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  const ress = [...inp.resistances].filter((n) => Number.isFinite(n)).sort((a, b) => a - b);

  if (inp.direction === "LONG") {
    const sup = [...sups].reverse().find((v) => v < inp.entry);
    const res = ress.find((v) => v > inp.entry);
    if (sup == null) return empty("No support below entry");
    const stop = round(sup * (1 - buffer));
    const dist = inp.entry - stop;
    if (dist <= 0) return empty("Support too close to entry");
    let target = res != null ? res : round(inp.entry + dist * minRR);
    if ((target - inp.entry) / dist < minRR) target = round(inp.entry + dist * minRR);
    return {
      stop,
      target,
      riskReward: round((target - inp.entry) / dist, 2),
      usedLevel: sup,
      note: res != null ? "Target = nearest resistance" : `Target = ${minRR}× risk`,
    };
  }
  const res = [...ress].find((v) => v > inp.entry);
  const sup = [...sups].reverse().find((v) => v < inp.entry);
  if (res == null) return empty("No resistance above entry");
  const stop = round(res * (1 + buffer));
  const dist = stop - inp.entry;
  if (dist <= 0) return empty("Resistance too close to entry");
  let target = sup != null ? sup : round(inp.entry - dist * minRR);
  if ((inp.entry - target) / dist < minRR) target = round(inp.entry - dist * minRR);
  return {
    stop,
    target,
    riskReward: round((inp.entry - target) / dist, 2),
    usedLevel: res,
    note: sup != null ? "Target = nearest support" : `Target = ${minRR}× risk`,
  };

  function empty(reason: string): StopTargetResult {
    return { stop: null, target: null, riskReward: null, usedLevel: null, note: reason };
  }
}

function round(n: number, dp = 2) {
  const m = 10 ** dp;
  return Math.round(n * m) / m;
}

// ─────────────────────────────────────────────────────────────
// Portfolio heat
// ─────────────────────────────────────────────────────────────

export type OpenPosition = {
  id: string;
  symbol: string;
  sector?: string;
  direction: Direction;
  riskAmount: number; // absolute ₹ at risk from entry→stop
  capitalUsed: number;
};

export type PortfolioHeat = {
  usedRisk: number;
  usedRiskPct: number;
  remainingRisk: number;
  exposure: number;
  exposurePct: number;
  sectorExposure: Record<string, number>;
  directionalExposure: { long: number; short: number };
  dailyCap: number;
};

export function computePortfolioHeat(
  positions: OpenPosition[],
  capital: number,
  dailyRiskPct: number,
): PortfolioHeat {
  const dailyCap = (capital * dailyRiskPct) / 100;
  let usedRisk = 0;
  let exposure = 0;
  const sectorExposure: Record<string, number> = {};
  const directionalExposure = { long: 0, short: 0 };
  for (const p of positions) {
    usedRisk += p.riskAmount;
    exposure += p.capitalUsed;
    const sec = p.sector ?? "OTHER";
    sectorExposure[sec] = (sectorExposure[sec] ?? 0) + p.capitalUsed;
    if (p.direction === "LONG") directionalExposure.long += p.riskAmount;
    else directionalExposure.short += p.riskAmount;
  }
  return {
    usedRisk,
    usedRiskPct: capital > 0 ? (usedRisk / capital) * 100 : 0,
    remainingRisk: Math.max(0, dailyCap - usedRisk),
    exposure,
    exposurePct: capital > 0 ? (exposure / capital) * 100 : 0,
    sectorExposure,
    directionalExposure,
    dailyCap,
  };
}

// ─────────────────────────────────────────────────────────────
// Daily / risk-meter / grading
// ─────────────────────────────────────────────────────────────

export type DailyStats = {
  trades: number;
  wins: number;
  losses: number;
  pnl: number;
  riskUsed: number;
};

export type DailyLimits = {
  capital: number;
  dailyRiskPct: number;
  maxTradesPerDay: number;
  maxDailyLossPct: number;
};

export type DailyLimitCheck = {
  stopTrading: boolean;
  reasons: string[];
  riskUsedPct: number;
  lossPct: number;
};

export function dailyLimitCheck(s: DailyStats, l: DailyLimits): DailyLimitCheck {
  const reasons: string[] = [];
  const riskUsedPct = l.capital > 0 ? (s.riskUsed / l.capital) * 100 : 0;
  const lossPct = l.capital > 0 ? (Math.min(0, s.pnl) / l.capital) * 100 : 0;
  if (riskUsedPct >= l.dailyRiskPct) reasons.push("Daily risk budget consumed");
  if (Math.abs(lossPct) >= l.maxDailyLossPct) reasons.push("Daily loss limit hit");
  if (s.trades >= l.maxTradesPerDay) reasons.push("Max trades for the day reached");
  return { stopTrading: reasons.length > 0, reasons, riskUsedPct, lossPct };
}

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export function riskMeter(usedRiskPct: number, dailyCapPct: number, conflicts = 0): RiskLevel {
  const ratio = dailyCapPct > 0 ? usedRiskPct / dailyCapPct : 0;
  if (ratio >= 1 || conflicts >= 3) return "CRITICAL";
  if (ratio >= 0.75 || conflicts >= 2) return "HIGH";
  if (ratio >= 0.4 || conflicts >= 1) return "MEDIUM";
  return "LOW";
}

export type QualityGrade = "A+" | "A" | "B" | "C" | "D";

export type QualityInput = {
  decisionConfidence: number; // 0..100
  historicalAccuracy: number | null; // 0..100
  optionsAgreement: boolean;
  riskReward: number | null;
  riskPct: number; // per-trade risk %
};

export function positionQuality(q: QualityInput): { grade: QualityGrade; score: number } {
  let score = 0;
  score += Math.max(0, Math.min(40, q.decisionConfidence * 0.4));
  if (q.historicalAccuracy != null)
    score += Math.max(0, Math.min(20, q.historicalAccuracy * 0.2));
  if (q.optionsAgreement) score += 15;
  if (q.riskReward != null) score += Math.max(0, Math.min(20, (q.riskReward - 1) * 10));
  // Risk hygiene: reward small per-trade risk.
  score += q.riskPct <= 1 ? 5 : q.riskPct <= 2 ? 2 : 0;
  const grade: QualityGrade =
    score >= 85 ? "A+" : score >= 70 ? "A" : score >= 55 ? "B" : score >= 40 ? "C" : "D";
  return { grade, score: Math.round(score) };
}

// ─────────────────────────────────────────────────────────────
// Pre-trade checklist
// ─────────────────────────────────────────────────────────────

export type ChecklistInput = {
  position: PositionResult;
  heat: PortfolioHeat;
  daily: DailyLimitCheck;
  defaults: ProfileDefaults;
  openPositions: number;
  sameDirectionOpen: number;
  decisionConfidence: number;
  riskReward: number | null;
  minRiskReward?: number;
};

export type ChecklistItem = { key: string; label: string; pass: boolean; detail?: string };

export function preTradeChecklist(inp: ChecklistInput): {
  items: ChecklistItem[];
  allPass: boolean;
} {
  const minRR = inp.minRiskReward ?? 1.5;
  const items: ChecklistItem[] = [
    {
      key: "size",
      label: "Position size valid",
      pass: inp.position.valid,
      detail: inp.position.reason,
    },
    {
      key: "daily",
      label: "Daily loss / trade limits not exceeded",
      pass: !inp.daily.stopTrading,
      detail: inp.daily.reasons.join(" · "),
    },
    {
      key: "heat",
      label: "Portfolio exposure acceptable",
      pass: inp.heat.usedRisk + inp.position.netRiskAmount <= inp.heat.dailyCap,
      detail: `Would use ₹${Math.round(
        inp.heat.usedRisk + inp.position.netRiskAmount,
      )} of ₹${Math.round(inp.heat.dailyCap)}`,
    },
    {
      key: "open",
      label: "Max open trades within limit",
      pass: inp.openPositions < inp.defaults.maxOpenTrades,
      detail: `${inp.openPositions}/${inp.defaults.maxOpenTrades} open`,
    },
    {
      key: "dir",
      label: "Same-direction cap respected",
      pass: inp.sameDirectionOpen < inp.defaults.maxSameDirection,
      detail: `${inp.sameDirectionOpen}/${inp.defaults.maxSameDirection} same-direction open`,
    },
    {
      key: "conf",
      label: "Decision confidence above threshold",
      pass: inp.decisionConfidence >= inp.defaults.minConfidence,
      detail: `${inp.decisionConfidence} vs ${inp.defaults.minConfidence}`,
    },
    {
      key: "rr",
      label: `Risk-reward ≥ ${minRR}`,
      pass: inp.riskReward != null && inp.riskReward >= minRR,
      detail: inp.riskReward != null ? `RR ${inp.riskReward.toFixed(2)}` : "No RR",
    },
  ];
  return { items, allPass: items.every((i) => i.pass) };
}

// ─────────────────────────────────────────────────────────────
// Journal (pure aggregation helpers — persistence lives in the UI)
// ─────────────────────────────────────────────────────────────

export type JournalEntry = {
  id: string;
  createdAt: string;
  symbol: string;
  direction: Direction;
  entry: number;
  exit: number | null;
  quantity: number;
  pnl: number | null;
  reason: string;
  decisionAction?: string;
  confidence?: number;
  riskAmount: number;
  outcome?: "WIN" | "LOSS" | "BREAKEVEN" | "OPEN";
  lessons?: string;
};

export type JournalReport = {
  trades: number;
  wins: number;
  losses: number;
  breakeven: number;
  open: number;
  winRatePct: number;
  totalPnl: number;
  avgWin: number;
  avgLoss: number;
  expectancy: number;
  profitFactor: number;
};

export function summariseJournal(entries: JournalEntry[]): JournalReport {
  const closed = entries.filter((e) => e.outcome && e.outcome !== "OPEN");
  const wins = closed.filter((e) => e.outcome === "WIN");
  const losses = closed.filter((e) => e.outcome === "LOSS");
  const breakeven = closed.filter((e) => e.outcome === "BREAKEVEN");
  const totalPnl = closed.reduce((s, e) => s + (e.pnl ?? 0), 0);
  const grossWin = wins.reduce((s, e) => s + (e.pnl ?? 0), 0);
  const grossLoss = Math.abs(losses.reduce((s, e) => s + (e.pnl ?? 0), 0));
  const avgWin = wins.length ? grossWin / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;
  const winRate = closed.length ? wins.length / closed.length : 0;
  const expectancy = winRate * avgWin - (1 - winRate) * avgLoss;
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;
  return {
    trades: closed.length,
    wins: wins.length,
    losses: losses.length,
    breakeven: breakeven.length,
    open: entries.length - closed.length,
    winRatePct: winRate * 100,
    totalPnl,
    avgWin,
    avgLoss,
    expectancy,
    profitFactor,
  };
}

export function filterJournalByRange(
  entries: JournalEntry[],
  range: "DAILY" | "WEEKLY" | "MONTHLY",
  now = new Date(),
): JournalEntry[] {
  const cutoff = new Date(now);
  if (range === "DAILY") cutoff.setHours(0, 0, 0, 0);
  else if (range === "WEEKLY") cutoff.setDate(cutoff.getDate() - 7);
  else cutoff.setDate(cutoff.getDate() - 30);
  return entries.filter((e) => new Date(e.createdAt) >= cutoff);
}