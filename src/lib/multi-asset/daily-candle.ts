// Phase 44B — Previous-completed-daily candle selector.
//
// Pure, deterministic, no I/O. Callers pass an array of candles (any provider).
// Selector rejects incomplete or stale candles and returns metadata for the
// caller's data-quality label.

export type CandleFreshness = "FRESH" | "STALE" | "UNAVAILABLE";

export interface RawDailyCandle {
  /** Candle open time (ISO or ms). Must represent the START of the day
   *  in the provider's native timezone. */
  readonly openTime: string | number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume?: number | null;
  /** True when the provider has finalised the candle. */
  readonly complete: boolean;
}

export interface SelectedCandle {
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number | null;
  readonly candleOpenTime: string;
  readonly candleCloseTime: string;
  readonly providerTimezone: string;
  readonly reportingTimezone: "Asia/Kolkata";
  readonly ageHours: number;
  readonly freshness: CandleFreshness;
  readonly session24x7: boolean;
}

export interface DailyCandleSelectionInput {
  readonly candles: readonly RawDailyCandle[];
  readonly providerTimezone: string;
  /** When true (crypto) staleness threshold is tighter. */
  readonly session24x7: boolean;
  /** Optional override for deterministic tests. */
  readonly now?: number;
}

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/** Max hours since candle close before it is considered STALE. */
const STALENESS_HOURS_INDEX = 72;   // NSE index — tolerates weekend + one holiday
const STALENESS_HOURS_24X7 = 30;    // crypto — one full day + small grace

function toMs(v: string | number): number {
  return typeof v === "number" ? v : Date.parse(v);
}

/**
 * Selects the previous COMPLETED daily candle from the array, using each
 * candle's own `complete` flag as the authoritative signal. When no complete
 * candle exists, returns `null`.
 */
export function selectPreviousCompletedDaily(
  input: DailyCandleSelectionInput,
): SelectedCandle | null {
  const now = input.now ?? Date.now();
  const staleThreshold =
    (input.session24x7 ? STALENESS_HOURS_24X7 : STALENESS_HOURS_INDEX) * MS_PER_HOUR;

  const completed = input.candles
    .filter((c) => c.complete && Number.isFinite(c.open) && Number.isFinite(c.close))
    .slice()
    .sort((a, b) => toMs(b.openTime) - toMs(a.openTime));

  const picked = completed[0];
  if (!picked) return null;

  const openMs = toMs(picked.openTime);
  const closeMs = openMs + MS_PER_DAY;
  const ageMs = now - closeMs;
  const ageHours = Math.max(0, ageMs / MS_PER_HOUR);

  const freshness: CandleFreshness =
    ageMs < 0 ? "UNAVAILABLE" : ageMs > staleThreshold ? "STALE" : "FRESH";

  return {
    open: picked.open,
    high: picked.high,
    low: picked.low,
    close: picked.close,
    volume: picked.volume ?? null,
    candleOpenTime: new Date(openMs).toISOString(),
    candleCloseTime: new Date(closeMs).toISOString(),
    providerTimezone: input.providerTimezone,
    reportingTimezone: "Asia/Kolkata",
    ageHours: Math.round(ageHours * 100) / 100,
    freshness,
    session24x7: input.session24x7,
  };
}