// Phase 2I-B — Gann Gap Outlook shared types.
// Research-only. Never produces BUY/SELL/LONG/SHORT wording.

export type GannGapLifecycle =
  | "PENDING"        // before 15:26 IST cutoff
  | "EVAL"           // between cutoff and market close
  | "FROZEN";        // final prediction persisted for the trading day

export type GannGapOutlookLabel =
  | "PENDING"
  | "GAP_UP_RESEARCH"
  | "GAP_DOWN_RESEARCH"
  | "INDECISION"
  | "NO_VALID_SETUP"
  | "DATA_UNAVAILABLE";

export type GannGapConfidenceBand =
  | "EXPERIMENTAL_LOW"
  | "EXPERIMENTAL_MEDIUM"
  | "EXPERIMENTAL_HIGH";

export interface GannSquareLevel {
  /** Root n such that levelBase = n*n (spec §2). */
  readonly n: number;
  /** n*n before parity correction. */
  readonly squareBase: number;
  /** Emitted level: if n*n is even, adds +1; else equals n*n. */
  readonly level: number;
  /** Signed distance from reference price. */
  readonly distance: number;
}

export interface GannGapClosingZone {
  /** Reference price used (usually the day's close). */
  readonly reference: number;
  /** Level immediately below reference. Null when no lower level exists. */
  readonly nearestBelow: GannSquareLevel | null;
  /** Level immediately above reference. Null when no higher level exists. */
  readonly nearestAbove: GannSquareLevel | null;
  /** True when close sits inside the indecision band around any level. */
  readonly insideIndecisionBand: boolean;
  /** Which side (if any) the close is "reclaiming" (above nearest-below level). */
  readonly reclaimedAbove: boolean;
  /** True when close is being rejected from nearest-above level. */
  readonly rejectedBelow: boolean;
}

export interface GannGapConfirmation {
  readonly id: string;
  readonly label: string;
  readonly alignment: "SUPPORTS_UP" | "SUPPORTS_DOWN" | "NEUTRAL" | "CONFLICT" | "UNAVAILABLE";
  readonly detail: string;
}

export interface GannGapOutlook {
  readonly formulaVersion: string;
  readonly configVersion: string;
  readonly tradingDate: string;         // IST YYYY-MM-DD (session in question)
  readonly nextTradingDate: string;     // IST YYYY-MM-DD (the day the outlook is for)
  readonly lifecycle: GannGapLifecycle;
  readonly label: GannGapOutlookLabel;
  readonly reference: number | null;
  readonly levels: readonly GannSquareLevel[];
  readonly zone: GannGapClosingZone | null;
  readonly confirmations: readonly GannGapConfirmation[];
  readonly confidence: GannGapConfidenceBand | null;
  readonly source: "LIVE" | "MIXED" | "RESEARCH_DEMO" | "UNAVAILABLE";
  readonly observedAt: string;
  readonly reasons: readonly string[];
  readonly featureEnabled: boolean;
}

export const GANN_GAP_DISCLAIMER =
  "Research-only. Not a trade recommendation. Never places a broker order.";