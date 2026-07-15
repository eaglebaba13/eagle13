// Phase 21.2 · Stage 5 — pure metric aggregator over per-session simulations.
// Reads SessionSimulation results (Stage 4) and reduces them into the metric
// families listed in spec §§5–15, §17. Descriptive only — never mutates
// production defaults, weights, or signal outputs.

import type { SessionSimulation, LevelSimulation } from "./gann-intraday-simulator";
import type { InstrumentSymbol } from "./gann-intraday-policy";
import { getInstrumentPolicy } from "./gann-intraday-policy";

export type SessionResult = {
  tradingDate: string;
  instrument: InstrumentSymbol;
  simulation: SessionSimulation;
  vixRegime?: "LOW" | "NORMAL" | "HIGH" | "VIX_UNAVAILABLE";
  costPerTrade?: number;
  slippagePerTrade?: number;
};

export type CoreMetrics = {
  sessions: number;
  totalTrades: number;
  wins: number;
  losses: number;
  ambiguous: number;
  buys: number;
  sells: number;
  missedChase: number;
  cubeApproved: number;
  cubeRejected: number;
  firstTouches: number;
  confirmed: number;
  retest: number;
  winRate: number;
  profitFactor: number;
  expectancy: number;
  netPnL: number;
  maxDrawdown: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  avgMfe: number;
  avgMae: number;
};

function isWinningLevel(p: LevelSimulation): boolean {
  return p.outcome === "TARGET";
}
function isLosingLevel(p: LevelSimulation): boolean {
  return p.outcome === "STOP";
}
function isTradedLevel(p: LevelSimulation): boolean {
  return p.outcome === "TARGET" || p.outcome === "STOP";
}

function pnlOf(
  p: LevelSimulation,
  instrument: InstrumentSymbol,
  costPerTrade: number,
  slippage: number,
): number {
  if (!isTradedLevel(p)) return 0;
  const policy = getInstrumentPolicy(instrument);
  const raw = isWinningLevel(p) ? policy.targetPoints : -policy.stopLossPoints;
  return raw - costPerTrade - slippage;
}

export function computeCoreMetrics(sessions: SessionResult[]): CoreMetrics {
  let wins = 0,
    losses = 0,
    ambiguous = 0,
    buys = 0,
    sells = 0;
  let missedChase = 0,
    cubeApproved = 0,
    cubeRejected = 0;
  let firstTouches = 0,
    confirmed = 0,
    retest = 0;
  let netPnL = 0;
  let grossWin = 0,
    grossLoss = 0;
  let mfeSum = 0,
    maeSum = 0,
    tradedCount = 0;
  const equity: number[] = [];
  let running = 0;
  const streak: number[] = [];

  for (const s of sessions) {
    firstTouches += s.simulation.counters.firstTouch;
    confirmed += s.simulation.counters.confirmed;
    retest += s.simulation.counters.retest;
    missedChase += s.simulation.counters.missedChase;
    cubeApproved += s.simulation.counters.cubeApproved;
    cubeRejected += s.simulation.counters.cubeConflict;

    for (const p of s.simulation.perLevel) {
      if (p.ambiguousExcluded) {
        ambiguous++;
        continue;
      }
      if (!isTradedLevel(p)) continue;
      tradedCount++;
      mfeSum += p.mfe;
      maeSum += p.mae;
      if (p.level.tradeBias === "BUY") buys++;
      if (p.level.tradeBias === "SELL") sells++;
      const pnl = pnlOf(
        p,
        s.instrument,
        s.costPerTrade ?? 0,
        s.slippagePerTrade ?? 0,
      );
      netPnL += pnl;
      running += pnl;
      equity.push(running);
      if (isWinningLevel(p)) {
        wins++;
        grossWin += Math.max(0, pnl);
        streak.push(1);
      } else if (isLosingLevel(p)) {
        losses++;
        grossLoss += Math.abs(Math.min(0, pnl));
        streak.push(-1);
      }
    }
  }

  // Drawdown from equity curve.
  let peak = 0;
  let maxDrawdown = 0;
  for (const eq of equity) {
    if (eq > peak) peak = eq;
    const dd = peak - eq;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  // Streaks.
  let maxWinStreak = 0,
    maxLossStreak = 0,
    curWin = 0,
    curLoss = 0;
  for (const s of streak) {
    if (s > 0) {
      curWin++;
      curLoss = 0;
      if (curWin > maxWinStreak) maxWinStreak = curWin;
    } else {
      curLoss++;
      curWin = 0;
      if (curLoss > maxLossStreak) maxLossStreak = curLoss;
    }
  }

  const totalTrades = wins + losses;
  const winRate = totalTrades > 0 ? wins / totalTrades : 0;
  const profitFactor =
    grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;
  const expectancy = totalTrades > 0 ? netPnL / totalTrades : 0;
  const avgMfe = tradedCount > 0 ? mfeSum / tradedCount : 0;
  const avgMae = tradedCount > 0 ? maeSum / tradedCount : 0;

  return {
    sessions: sessions.length,
    totalTrades,
    wins,
    losses,
    ambiguous,
    buys,
    sells,
    missedChase,
    cubeApproved,
    cubeRejected,
    firstTouches,
    confirmed,
    retest,
    winRate,
    profitFactor,
    expectancy,
    netPnL,
    maxDrawdown,
    maxConsecutiveWins: maxWinStreak,
    maxConsecutiveLosses: maxLossStreak,
    avgMfe,
    avgMae,
  };
}

export type SafetyBucket = "SAFE" | "RISKY_PIVOT" | "RISKY_NOPIVOT";

export function bucketBySafety(sessions: SessionResult[]): Record<SafetyBucket, CoreMetrics> {
  const buckets: Record<SafetyBucket, SessionResult[]> = {
    SAFE: [],
    RISKY_PIVOT: [],
    RISKY_NOPIVOT: [],
  };
  for (const s of sessions) {
    for (const bucket of Object.keys(buckets) as SafetyBucket[]) {
      const filtered: SessionResult = {
        ...s,
        simulation: {
          ...s.simulation,
          perLevel: s.simulation.perLevel.filter((p) => {
            if (bucket === "SAFE") return p.level.safety === "SAFE";
            if (bucket === "RISKY_PIVOT")
              return p.level.safety === "RISKY" && p.level.pivotConfluence !== "NONE";
            return p.level.safety === "RISKY" && p.level.pivotConfluence === "NONE";
          }),
        },
      };
      buckets[bucket].push(filtered);
    }
  }
  return {
    SAFE: computeCoreMetrics(buckets.SAFE),
    RISKY_PIVOT: computeCoreMetrics(buckets.RISKY_PIVOT),
    RISKY_NOPIVOT: computeCoreMetrics(buckets.RISKY_NOPIVOT),
  };
}

export type CubeGrade = "A" | "B" | "C" | "NONE";

export function bucketByCubeGrade(
  sessions: SessionResult[],
): Record<CubeGrade, CoreMetrics> {
  const grades: CubeGrade[] = ["A", "B", "C", "NONE"];
  const out = {} as Record<CubeGrade, CoreMetrics>;
  for (const g of grades) {
    const filtered = sessions.map((s) => ({
      ...s,
      simulation: {
        ...s.simulation,
        perLevel: s.simulation.perLevel.filter((p) => p.cube.cubeGrade === g),
      },
    }));
    out[g] = computeCoreMetrics(filtered);
  }
  return out;
}

/** IST time-of-day bucket derived from the entry timestamp. */
export type TimeBucket = "09:15-10:00" | "10:00-11:30" | "11:30-13:30" | "13:30-14:30" | "14:30-15:30";
export const TIME_BUCKETS: TimeBucket[] = [
  "09:15-10:00",
  "10:00-11:30",
  "11:30-13:30",
  "13:30-14:30",
  "14:30-15:30",
];
function bucketForTime(timeIst: string): TimeBucket | null {
  const m = /T(\d{2}):(\d{2})/.exec(timeIst);
  if (!m) return null;
  const mins = parseInt(m[1]) * 60 + parseInt(m[2]);
  if (mins < 9 * 60 + 15) return null;
  if (mins < 10 * 60) return "09:15-10:00";
  if (mins < 11 * 60 + 30) return "10:00-11:30";
  if (mins < 13 * 60 + 30) return "11:30-13:30";
  if (mins < 14 * 60 + 30) return "13:30-14:30";
  if (mins < 15 * 60 + 30) return "14:30-15:30";
  return null;
}

export function bucketByTimeOfDay(
  sessions: SessionResult[],
): Record<TimeBucket, CoreMetrics> {
  const out = {} as Record<TimeBucket, CoreMetrics>;
  for (const bucket of TIME_BUCKETS) {
    const filtered = sessions.map((s) => ({
      ...s,
      simulation: {
        ...s.simulation,
        perLevel: s.simulation.perLevel.filter(
          (p) => p.entryTimeIst != null && bucketForTime(p.entryTimeIst) === bucket,
        ),
      },
    }));
    out[bucket] = computeCoreMetrics(filtered);
  }
  return out;
}

export function bucketByPlanet(sessions: SessionResult[]): Record<string, CoreMetrics> {
  const planets = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Rahu", "Ketu"];
  const out: Record<string, CoreMetrics> = {};
  for (const planet of planets) {
    const filtered = sessions.map((s) => ({
      ...s,
      simulation: {
        ...s.simulation,
        perLevel: s.simulation.perLevel.filter((p) => p.level.planet === planet),
      },
    }));
    out[planet] = computeCoreMetrics(filtered);
  }
  return out;
}

export function bucketByLevelFamily(
  sessions: SessionResult[],
): Record<"L1" | "L2" | "L3" | "L4", CoreMetrics> {
  const out = {} as Record<"L1" | "L2" | "L3" | "L4", CoreMetrics>;
  for (const family of ["L1", "L2", "L3", "L4"] as const) {
    const filtered = sessions.map((s) => ({
      ...s,
      simulation: {
        ...s.simulation,
        perLevel: s.simulation.perLevel.filter((p) => p.level.sourceLevel === family),
      },
    }));
    out[family] = computeCoreMetrics(filtered);
  }
  return out;
}