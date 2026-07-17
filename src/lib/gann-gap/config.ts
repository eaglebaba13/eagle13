// Phase 2I-B — Gann Gap Outlook config (deterministic thresholds).
// Pure. Changing any value here should bump GANN_GAP_CONFIG_VERSION.

export interface GannGapConfig {
  /** Signal cut-off in IST (24h). Reads before this time → PENDING. */
  readonly signalCutoffIst: { readonly hour: number; readonly minute: number };
  /** Maximum age of the input price snapshot in seconds. Above → STALE. */
  readonly maxSnapshotAgeSeconds: number;
  /** Absolute tolerance (points) around a level to consider it "touched". */
  readonly touchToleranceAbs: number;
  /** Relative tolerance (fraction of price) around a level. */
  readonly touchTolerancePct: number;
  /** Half-width of the "indecision" band (points) centred on the base level. */
  readonly indecisionBandPoints: number;
  /** Number of levels above and below to generate. */
  readonly levelsBelow: number;
  readonly levelsAbove: number;
  /** Sample sizes required before showing historical accuracy figures. */
  readonly minSamplesForRate: number;      // e.g. 30 — show a rate
  readonly minSamplesForConfidence: number; // e.g. 100 — show a confidence band
}

export const DEFAULT_GANN_GAP_CONFIG: GannGapConfig = {
  signalCutoffIst: { hour: 15, minute: 26 },
  maxSnapshotAgeSeconds: 15 * 60,
  touchToleranceAbs: 10,
  touchTolerancePct: 0.001,
  indecisionBandPoints: 15,
  levelsBelow: 3,
  levelsAbove: 3,
  minSamplesForRate: 30,
  minSamplesForConfidence: 100,
};