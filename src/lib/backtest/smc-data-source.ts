// Phase 21.4 · Stage 4A — SMC intraday data-source loader.
//
// Pure, client-safe. Reuses candle-csv-parser + candle-data-quality so no
// duplicate math ships. Provider fetch is intentionally NOT implemented in
// this stage — no intraday provider is wired in a client-safe module today.
// Rather than silently resampling daily candles into intraday bars we throw
// DATA_RANGE_UNAVAILABLE. This preserves the no-daily→intraday guarantee.

import { parseCandleCsv, type ProviderLabel } from "../candle-csv-parser";
import { computeDataQuality, type DataQualityReport } from "../candle-data-quality";
import type { Candle } from "../smc-types";
import type { DataGranularity, DataQualitySummary } from "./result";

export type SmcInstrument = "NIFTY50" | "BANKNIFTY" | "BTC" | "XAUUSD";
export type SmcTimeframe = "5m" | "15m";

export type SmcCsvSource = {
  kind: "csv";
  csv: string;
  provider: ProviderLabel;
};
export type SmcProviderSource = {
  kind: "provider";
  provider: string;
};
export type SmcDataSource = SmcCsvSource | SmcProviderSource;

export type LoadSmcCandlesArgs = {
  instrument: SmcInstrument;
  timeframe: SmcTimeframe;
  from: string;
  to: string;
  timezone: "Asia/Kolkata" | "UTC";
  source: SmcDataSource;
};

export type LoadSmcCandlesResult = {
  candles: readonly Candle[];
  dataQuality: DataQualitySummary;
  dataQualityReport: DataQualityReport;
  dataHash: string;
  provider: string;
  requestedFrom: string;
  requestedTo: string;
  actualFrom: string | null;
  actualTo: string | null;
  rejected: number;
  warnings: readonly string[];
};

export class SmcDataRangeUnavailableError extends Error {
  readonly code = "DATA_RANGE_UNAVAILABLE" as const;
  constructor(message: string) {
    super(message);
    this.name = "SmcDataRangeUnavailableError";
  }
}

/** Deterministic 32-bit FNV-1a hash — same family used by run-id.ts. */
export function hashCandleSeries(candles: readonly Candle[]): string {
  let h = 0x811c9dc5;
  const mix = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
  };
  for (const c of candles) {
    mix(`${c.t}|${c.o}|${c.h}|${c.l}|${c.c}|${c.v}|`);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function bucketMs(tf: SmcTimeframe): number {
  return tf === "5m" ? 5 * 60_000 : 15 * 60_000;
}

/**
 * Rebucket 5-minute rows into 15-minute candles. NEVER promotes daily bars
 * to intraday — the source parser only accepts "5m" so anything coarser is
 * rejected upstream with DATA_RANGE_UNAVAILABLE.
 */
function rebucket(rows: readonly Candle[], tf: SmcTimeframe): Candle[] {
  if (tf === "5m") return [...rows];
  const size = bucketMs(tf);
  const out: Candle[] = [];
  let bucket: Candle | null = null;
  for (const r of rows) {
    const bStart = Math.floor(r.t / size) * size;
    if (!bucket || bucket.t !== bStart) {
      if (bucket) out.push(bucket);
      bucket = { t: bStart, o: r.o, h: r.h, l: r.l, c: r.c, v: r.v };
    } else {
      bucket.h = Math.max(bucket.h, r.h);
      bucket.l = Math.min(bucket.l, r.l);
      bucket.c = r.c;
      bucket.v += r.v;
    }
  }
  if (bucket) out.push(bucket);
  return out;
}

function isoDate(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

export async function loadSmcCandles(
  args: LoadSmcCandlesArgs,
): Promise<LoadSmcCandlesResult> {
  if (args.source.kind === "provider") {
    throw new SmcDataRangeUnavailableError(
      `DATA_RANGE_UNAVAILABLE — provider "${args.source.provider}" has no client-safe intraday feed for ${args.instrument} ${args.timeframe} between ${args.from} and ${args.to}. Import a ${args.timeframe} CSV instead.`,
    );
  }
  const parsed = parseCandleCsv({
    csv: args.source.csv,
    provider: args.source.provider,
    instrument: args.instrument,
    timezone: args.timezone,
    interval: "5m",
  });
  const inWindow = parsed.rows.filter((r) => {
    const d = isoDate(r.openTimeMs);
    return d >= args.from && d <= args.to;
  });
  if (inWindow.length === 0) {
    throw new SmcDataRangeUnavailableError(
      `DATA_RANGE_UNAVAILABLE — CSV has zero rows inside ${args.from} → ${args.to}.`,
    );
  }
  const report = computeDataQuality(inWindow);
  const base: Candle[] = inWindow.map((r) => ({
    t: r.openTimeMs,
    o: r.open,
    h: r.high,
    l: r.low,
    c: r.close,
    v: r.volume ?? 0,
  }));
  const candles = rebucket(base, args.timeframe);
  const dataHash = hashCandleSeries(candles);
  const granularity: DataGranularity = args.timeframe === "5m" ? "5m" : "5m"; // 15m folds into 5m granularity envelope
  const dataQuality: DataQualitySummary = {
    provider: args.source.provider,
    granularity,
    coveragePct: report.coveragePct,
    missingSessions: report.gaps.length,
    invalidCandles:
      report.outOfOrderCount + report.outOfWindowCount + report.causalityFailures,
    imported: parsed.rows.length,
    fetched: 0,
    previousCloseSource: "csv",
    snapshotSource: "csv",
    cacheStatus: "n/a",
  };
  return {
    candles,
    dataQuality,
    dataQualityReport: report,
    dataHash,
    provider: args.source.provider,
    requestedFrom: args.from,
    requestedTo: args.to,
    actualFrom: candles.length > 0 ? isoDate(candles[0].t) : null,
    actualTo: candles.length > 0 ? isoDate(candles[candles.length - 1].t) : null,
    rejected: parsed.rejected.length,
    warnings: parsed.warnings.map((w) => `row ${w.rowIndex}: ${w.message}`),
  };
}

export const SMC_INSTRUMENTS: readonly SmcInstrument[] = [
  "NIFTY50",
  "BANKNIFTY",
  "BTC",
  "XAUUSD",
];
export const SMC_TIMEFRAMES: readonly SmcTimeframe[] = ["5m", "15m"];