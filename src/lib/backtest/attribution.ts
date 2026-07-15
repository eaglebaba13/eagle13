// Phase 21.4 · Stage 4C — Three-way trade attribution.
// Pure. Aligns Astro / SMC / Hybrid trades by (date, direction) and buckets
// each event into one of the analytical categories in the Stage 4C brief.
// Never mutates input trades; never merges positions.

import type { HistoricalTrade } from "./result";

export type AttributionBucketId =
  | "HYBRID_KEPT_ASTRO_WINNER"
  | "HYBRID_FILTERED_ASTRO_LOSER"
  | "HYBRID_MISSED_ASTRO_WINNER"
  | "HYBRID_KEPT_ASTRO_LOSER"
  | "HYBRID_KEPT_SMC_WINNER"
  | "HYBRID_FILTERED_SMC_LOSER"
  | "HYBRID_MISSED_SMC_WINNER"
  | "HYBRID_KEPT_SMC_LOSER"
  | "ASTRO_ONLY"
  | "SMC_ONLY"
  | "AGREEMENT_NO_TRADE"
  | "CONFLICT_BLOCKED"
  | "DATA_INCOMPLETE";

export type AttributionMetrics = {
  count: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnl: number;
  profitFactor: number;
  expectancy: number;
  avgMfe: number;
  avgMae: number;
};

export type ThreeWayAttribution = Readonly<
  Record<AttributionBucketId, AttributionMetrics>
> & { totals: AttributionMetrics };

type Side = "BUY" | "SELL";

function tradeSide(t: HistoricalTrade): Side | null {
  return t.side === "BUY" || t.side === "SELL" ? t.side : null;
}

function keyOf(t: HistoricalTrade): string | null {
  const side = tradeSide(t);
  if (!side) return null;
  return `${t.date}|${side}`;
}

function isWinner(t: HistoricalTrade): boolean {
  return t.outcome === "WIN";
}
function isLoser(t: HistoricalTrade): boolean {
  return t.outcome === "LOSS";
}

function emptyMetrics(): AttributionMetrics {
  return {
    count: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    netPnl: 0,
    profitFactor: 0,
    expectancy: 0,
    avgMfe: 0,
    avgMae: 0,
  };
}

function accumulate(m: AttributionMetrics, t: HistoricalTrade | null): void {
  m.count += 1;
  if (!t) return;
  if (isWinner(t)) m.wins += 1;
  if (isLoser(t)) m.losses += 1;
  m.netPnl += t.pnl;
  m.avgMfe += t.mfe ?? 0;
  m.avgMae += t.mae ?? 0;
}

function finalise(m: AttributionMetrics, gross: { gain: number; loss: number }): AttributionMetrics {
  const n = m.count;
  const winRate = n > 0 ? Math.round((m.wins / n) * 10000) / 100 : 0;
  const expectancy = n > 0 ? Math.round((m.netPnl / n) * 100) / 100 : 0;
  const avgMfe = n > 0 ? Math.round((m.avgMfe / n) * 100) / 100 : 0;
  const avgMae = n > 0 ? Math.round((m.avgMae / n) * 100) / 100 : 0;
  const profitFactor =
    gross.loss > 0 ? Math.round((gross.gain / gross.loss) * 100) / 100 : gross.gain > 0 ? Infinity : 0;
  return {
    ...m,
    winRate,
    expectancy,
    avgMfe,
    avgMae,
    profitFactor,
    netPnl: Math.round(m.netPnl * 100) / 100,
  };
}

export type HybridBucketDiagnostics = {
  agreementNoTradeCount: number;
  conflictBlockedCount: number;
  dataIncompleteCount: number;
};

/**
 * Compute three-way attribution.
 * @param astro standalone Astro trades
 * @param smc   standalone SMC trades
 * @param hybrid hybrid strategy trades (already filtered)
 * @param diagnostics hybrid decision counters from the adapter
 */
export function computeThreeWayAttribution(
  astro: readonly HistoricalTrade[],
  smc: readonly HistoricalTrade[],
  hybrid: readonly HistoricalTrade[],
  diagnostics: HybridBucketDiagnostics = {
    agreementNoTradeCount: 0,
    conflictBlockedCount: 0,
    dataIncompleteCount: 0,
  },
): ThreeWayAttribution {
  const buckets: Record<AttributionBucketId, AttributionMetrics> = {
    HYBRID_KEPT_ASTRO_WINNER: emptyMetrics(),
    HYBRID_FILTERED_ASTRO_LOSER: emptyMetrics(),
    HYBRID_MISSED_ASTRO_WINNER: emptyMetrics(),
    HYBRID_KEPT_ASTRO_LOSER: emptyMetrics(),
    HYBRID_KEPT_SMC_WINNER: emptyMetrics(),
    HYBRID_FILTERED_SMC_LOSER: emptyMetrics(),
    HYBRID_MISSED_SMC_WINNER: emptyMetrics(),
    HYBRID_KEPT_SMC_LOSER: emptyMetrics(),
    ASTRO_ONLY: emptyMetrics(),
    SMC_ONLY: emptyMetrics(),
    AGREEMENT_NO_TRADE: emptyMetrics(),
    CONFLICT_BLOCKED: emptyMetrics(),
    DATA_INCOMPLETE: emptyMetrics(),
  };
  const gross: Record<AttributionBucketId, { gain: number; loss: number }> = {
    HYBRID_KEPT_ASTRO_WINNER: { gain: 0, loss: 0 },
    HYBRID_FILTERED_ASTRO_LOSER: { gain: 0, loss: 0 },
    HYBRID_MISSED_ASTRO_WINNER: { gain: 0, loss: 0 },
    HYBRID_KEPT_ASTRO_LOSER: { gain: 0, loss: 0 },
    HYBRID_KEPT_SMC_WINNER: { gain: 0, loss: 0 },
    HYBRID_FILTERED_SMC_LOSER: { gain: 0, loss: 0 },
    HYBRID_MISSED_SMC_WINNER: { gain: 0, loss: 0 },
    HYBRID_KEPT_SMC_LOSER: { gain: 0, loss: 0 },
    ASTRO_ONLY: { gain: 0, loss: 0 },
    SMC_ONLY: { gain: 0, loss: 0 },
    AGREEMENT_NO_TRADE: { gain: 0, loss: 0 },
    CONFLICT_BLOCKED: { gain: 0, loss: 0 },
    DATA_INCOMPLETE: { gain: 0, loss: 0 },
  };

  const record = (id: AttributionBucketId, t: HistoricalTrade | null) => {
    accumulate(buckets[id], t);
    if (t) {
      if (t.pnl > 0) gross[id].gain += t.pnl;
      else if (t.pnl < 0) gross[id].loss += -t.pnl;
    }
  };

  const astroMap = new Map<string, HistoricalTrade>();
  const smcMap = new Map<string, HistoricalTrade>();
  const hybridMap = new Map<string, HistoricalTrade>();
  for (const t of astro) {
    const k = keyOf(t);
    if (k) astroMap.set(k, t);
  }
  for (const t of smc) {
    const k = keyOf(t);
    if (k) smcMap.set(k, t);
  }
  for (const t of hybrid) {
    const k = keyOf(t);
    if (k) hybridMap.set(k, t);
  }

  const allKeys = new Set<string>([
    ...astroMap.keys(),
    ...smcMap.keys(),
    ...hybridMap.keys(),
  ]);

  for (const k of allKeys) {
    const a = astroMap.get(k) ?? null;
    const s = smcMap.get(k) ?? null;
    const h = hybridMap.get(k) ?? null;

    // Astro-vs-hybrid attribution
    if (a) {
      if (h) {
        if (isWinner(a)) record("HYBRID_KEPT_ASTRO_WINNER", a);
        else if (isLoser(a)) record("HYBRID_KEPT_ASTRO_LOSER", a);
      } else {
        if (isLoser(a)) record("HYBRID_FILTERED_ASTRO_LOSER", a);
        else if (isWinner(a)) record("HYBRID_MISSED_ASTRO_WINNER", a);
      }
    }
    // SMC-vs-hybrid attribution
    if (s) {
      if (h) {
        if (isWinner(s)) record("HYBRID_KEPT_SMC_WINNER", s);
        else if (isLoser(s)) record("HYBRID_KEPT_SMC_LOSER", s);
      } else {
        if (isLoser(s)) record("HYBRID_FILTERED_SMC_LOSER", s);
        else if (isWinner(s)) record("HYBRID_MISSED_SMC_WINNER", s);
      }
    }
    // Astro-only / SMC-only
    if (a && !s) record("ASTRO_ONLY", a);
    if (s && !a) record("SMC_ONLY", s);
  }

  // Non-trade buckets: sourced from adapter diagnostics.
  buckets.AGREEMENT_NO_TRADE.count = diagnostics.agreementNoTradeCount;
  buckets.CONFLICT_BLOCKED.count = diagnostics.conflictBlockedCount;
  buckets.DATA_INCOMPLETE.count = diagnostics.dataIncompleteCount;

  const finalised: Record<AttributionBucketId, AttributionMetrics> =
    Object.fromEntries(
      (Object.keys(buckets) as AttributionBucketId[]).map((id) => [
        id,
        finalise(buckets[id], gross[id]),
      ]),
    ) as Record<AttributionBucketId, AttributionMetrics>;

  const totalsMetrics = emptyMetrics();
  const totalsGross = { gain: 0, loss: 0 };
  for (const t of hybrid) {
    accumulate(totalsMetrics, t);
    if (t.pnl > 0) totalsGross.gain += t.pnl;
    else if (t.pnl < 0) totalsGross.loss += -t.pnl;
  }
  return {
    ...finalised,
    totals: finalise(totalsMetrics, totalsGross),
  };
}