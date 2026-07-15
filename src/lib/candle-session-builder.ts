// Phase 21.2 · Stage 5.1 — session builder. Groups parsed candles into
// per-trading-day sessions and attaches provenance. Rejects sessions with
// no known previous-session close (causality guard).

import type { ParsedCandle } from "./candle-csv-parser";
import { groupBySessionDate } from "./candle-data-quality";
import type { TimedCandle5m } from "./gann-intraday-touch";
import {
  GANN_ABSOLUTE_INTRADAY_INGEST_VERSION,
  INTRADAY_FORMULA_VERSIONS,
} from "./engine-version";

export type BuiltSession = {
  tradingDate: string;
  previousCloseDate: string | null;
  previousClose: number | null;
  candles: TimedCandle5m[];
  candlesCount: number;
  hasPreviousClose: boolean;
  rejectionReason: string | null;
};

export type BuildResult = {
  ingestVersion: typeof GANN_ABSOLUTE_INTRADAY_INGEST_VERSION;
  formulaVersion: typeof INTRADAY_FORMULA_VERSIONS.GANN_ASTRO_INTRADAY_ABSOLUTE_V1;
  provider: string;
  instrument: string;
  from: string;
  to: string;
  sessions: BuiltSession[];
  usable: BuiltSession[];
  rejected: BuiltSession[];
  generatedAt: string;
};

function toTimed(c: ParsedCandle): TimedCandle5m {
  return {
    timeIst: c.timeIst,
    openTimeMs: c.openTimeMs,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  };
}

export function buildSessions(args: {
  provider: string;
  instrument: string;
  rows: ParsedCandle[];
}): BuildResult {
  const grouped = groupBySessionDate(args.rows);
  const dates = [...grouped.keys()].sort();
  const closes = new Map<string, number>();
  for (const [date, candles] of grouped) {
    if (candles.length > 0) {
      closes.set(date, candles[candles.length - 1].close);
    }
  }
  const sessions: BuiltSession[] = dates.map((date) => {
    const candles = grouped.get(date)!.map(toTimed);
    // previous session = most recent earlier date with a close.
    let prevDate: string | null = null;
    for (let i = dates.indexOf(date) - 1; i >= 0; i--) {
      const d = dates[i];
      if (closes.has(d)) {
        prevDate = d;
        break;
      }
    }
    const prevClose = prevDate != null ? (closes.get(prevDate) ?? null) : null;
    const hasPrev = prevDate != null && prevClose != null && prevDate < date;
    const rejection = !hasPrev ? "No previous-session close available" : null;
    return {
      tradingDate: date,
      previousCloseDate: prevDate,
      previousClose: prevClose,
      candles,
      candlesCount: candles.length,
      hasPreviousClose: hasPrev,
      rejectionReason: rejection,
    };
  });

  const usable = sessions.filter((s) => s.rejectionReason == null);
  const rejected = sessions.filter((s) => s.rejectionReason != null);
  const from = dates[0] ?? "";
  const to = dates[dates.length - 1] ?? "";
  return {
    ingestVersion: GANN_ABSOLUTE_INTRADAY_INGEST_VERSION,
    formulaVersion: INTRADAY_FORMULA_VERSIONS.GANN_ASTRO_INTRADAY_ABSOLUTE_V1,
    provider: args.provider,
    instrument: args.instrument,
    from,
    to,
    sessions,
    usable,
    rejected,
    generatedAt: new Date().toISOString(),
  };
}