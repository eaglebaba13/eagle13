// Phase 27 · Stage 1 — Combined PCR orchestrator.
//
// Pure consumer of the Option Chain Foundation. Given a snapshot per
// instrument (already fetched by getOptionChain) and a snapshot
// history for EMA smoothing, produces a research-only reading.

import type { OptionChainSnapshot, OptionUnderlying } from "../option-chain/types";
import { filterStrikes } from "../option-chain/strike-filter";
import type { AtmMode } from "../option-chain/atm-engine";
import { computeAtm } from "../option-chain/atm-engine";
import type { SnapshotHistory } from "../option-chain/snapshot-history";
import { assessDataQuality } from "../option-chain/data-quality";
import {
  aggregateStrikes,
  combinedScore,
  instrumentScore,
  normalizePcr,
  renormalizeWeights,
  safeRatio,
  validateWeights,
} from "./pcr-math";
import { computeEmaSeries, tip } from "./ema-engine";
import {
  advanceConfirmation,
  classifyState,
  INITIAL_CONFIRMATION,
  signalReason,
  type ConfirmationState,
} from "./signal-engine";
import {
  DEFAULT_COMBINED_PCR_WEIGHTS,
  FORMULA_VERSION,
  type CombinedPcrReading,
  type CombinedPcrWeights,
  type InstrumentPcr,
} from "./types";

export interface ComputeCombinedPcrInput {
  readonly snapshots: Partial<Record<OptionUnderlying, OptionChainSnapshot | null>>;
  readonly weights?: CombinedPcrWeights;
  readonly atmMode?: AtmMode;
  readonly atmCustom?: number;
  readonly history?: SnapshotHistory | null;
  readonly previousConfirmation?: ConfirmationState;
  readonly runId: string;
  readonly nowIso?: string;
  /** Freshness threshold in ms (default 5 min). */
  readonly freshnessMs?: number;
}

function snapshotId(snap: OptionChainSnapshot): string {
  return `${snap.instrument}:${snap.expiry}:${snap.timestamp}`;
}

function computeInstrumentPcr(
  underlying: OptionUnderlying,
  snap: OptionChainSnapshot | null | undefined,
  atmMode: AtmMode,
  atmCustom: number | undefined,
  configuredWeight: number,
  nowIso: string,
  freshnessMs: number,
  warnings: string[],
): InstrumentPcr | null {
  if (!snap) {
    warnings.push(`${underlying}: snapshot missing`);
    return null;
  }
  const q = assessDataQuality(snap, { nowIso, staleMs: freshnessMs });
  if (!q.ok) {
    for (const iss of q.issues) {
      if (iss.severity === "FAIL") warnings.push(`${underlying}: ${iss.code}`);
    }
  }
  const filter = filterStrikes(snap, atmMode, atmCustom);
  if (filter.included.length < 5) {
    warnings.push(`${underlying}: fewer than 5 strikes (${filter.included.length})`);
  }
  const agg = aggregateStrikes(filter.included);
  const rawOi = safeRatio(agg.putOi, agg.callOi);
  const rawCh = safeRatio(agg.putChangeOiPositive, agg.callChangeOiPositive);
  const normOi = normalizePcr(rawOi);
  const normCh = normalizePcr(rawCh);
  const score = instrumentScore(normOi, normCh);
  const atm = computeAtm(snap.strikes, snap.spotPrice, atmMode, atmCustom).atm;
  const missing = [...agg.missing];
  if (rawOi == null) missing.push("oi.pcr");
  if (rawCh == null) missing.push("changeOi.pcr");
  return {
    underlying,
    rawOiPcr: rawOi,
    rawChangeOiPcr: rawCh,
    normalizedOiPcr: normOi,
    normalizedChangeOiPcr: normCh,
    instrumentScore: score,
    weight: configuredWeight,
    configuredWeight,
    strikeCount: filter.included.length,
    atm,
    expiry: snap.expiry ?? null,
    provider: snap.provider,
    timestamp: snap.timestamp,
    snapshotId: snapshotId(snap),
    missing,
  };
}

function collectHistoricalScores(
  history: SnapshotHistory | null | undefined,
  instruments: readonly InstrumentPcr[],
  atmMode: AtmMode,
  atmCustom: number | undefined,
  weights: readonly (number | null)[],
  currentCombined: number | null,
): readonly (number | null)[] {
  if (!history || instruments.length === 0) {
    return currentCombined == null ? [] : [currentCombined];
  }
  // For each instrument, walk its bounded history and compute a score
  // series; then combine per-timestep using effective weights.
  const perInstrumentSeries = instruments.map((inst) => {
    if (!inst.expiry) return [] as (number | null)[];
    const snaps = history.list(inst.underlying, inst.expiry);
    return snaps.map((snap) => {
      const filter = filterStrikes(snap, atmMode, atmCustom);
      const agg = aggregateStrikes(filter.included);
      const normOi = normalizePcr(safeRatio(agg.putOi, agg.callOi));
      const normCh = normalizePcr(safeRatio(agg.putChangeOiPositive, agg.callChangeOiPositive));
      return instrumentScore(normOi, normCh);
    });
  });
  const len = Math.min(...perInstrumentSeries.map((s) => s.length));
  if (!Number.isFinite(len) || len <= 0) {
    return currentCombined == null ? [] : [currentCombined];
  }
  const combined: (number | null)[] = [];
  for (let t = 0; t < len; t += 1) {
    let sum = 0;
    let anyValid = false;
    for (let i = 0; i < instruments.length; i += 1) {
      const w = weights[i];
      const v = perInstrumentSeries[i][perInstrumentSeries[i].length - len + t];
      if (w == null || v == null) continue;
      sum += w * v;
      anyValid = true;
    }
    combined.push(anyValid ? sum : null);
  }
  // If the tip differs (current call not yet pushed), append it.
  if (currentCombined != null && (combined.length === 0 || combined[combined.length - 1] !== currentCombined)) {
    combined.push(currentCombined);
  }
  return combined;
}

export function computeCombinedPcr(input: ComputeCombinedPcrInput): CombinedPcrReading {
  const weights = input.weights ?? DEFAULT_COMBINED_PCR_WEIGHTS;
  const validation = validateWeights(weights);
  const warnings: string[] = [];
  if (!validation.ok && validation.error) warnings.push(`weights: ${validation.error}`);
  const atmMode: AtmMode = input.atmMode ?? "ATM_10";
  const atmCustom = input.atmCustom;
  const nowIso = input.nowIso ?? new Date().toISOString();
  const freshnessMs = input.freshnessMs ?? 5 * 60 * 1000;

  const configured: Array<{ u: OptionUnderlying; w: number }> = [
    { u: "NIFTY", w: weights.NIFTY },
    { u: "BANKNIFTY", w: weights.BANKNIFTY },
  ];

  const instruments: InstrumentPcr[] = [];
  for (const c of configured) {
    const snap = input.snapshots[c.u] ?? null;
    const inst = computeInstrumentPcr(c.u, snap, atmMode, atmCustom, c.w, nowIso, freshnessMs, warnings);
    if (inst) instruments.push(inst);
  }

  // Renormalize effective weights across instruments with a valid score.
  const eff = renormalizeWeights(instruments.map((i) => ({ weight: i.configuredWeight, score: i.instrumentScore })));
  const withEffective: InstrumentPcr[] = instruments.map((i, idx) => ({ ...i, weight: eff[idx] ?? 0 }));

  const currentCombined = combinedScore(withEffective);
  const scores = collectHistoricalScores(input.history ?? null, withEffective, atmMode, atmCustom, eff, currentCombined);
  const series = computeEmaSeries(scores);
  const t = tip(series);

  const candidate = classifyState({ score: currentCombined, slope: t.slope });
  const prevConf = input.previousConfirmation ?? INITIAL_CONFIRMATION;
  const conf = advanceConfirmation(prevConf, candidate);

  const direction: "CE" | "NEUTRAL" | "PE" =
    currentCombined == null || Math.abs(currentCombined) < 5
      ? "NEUTRAL"
      : currentCombined < 0
        ? "CE"
        : "PE";

  void FORMULA_VERSION;

  return {
    combinedScore: currentCombined,
    direction,
    emaFast: t.fast,
    emaSlow: t.slow,
    slope: t.slope,
    previousSlope: t.previousSlope,
    slopeChange: t.slopeChange,
    zeroCross: t.zeroCross,
    signalState: candidate,
    confirmedState: conf.confirmed,
    pendingState: conf.pending,
    confirmationCount: conf.count,
    instruments: withEffective,
    timestamp: nowIso,
    warnings,
    runId: input.runId,
  };
}

export { signalReason };