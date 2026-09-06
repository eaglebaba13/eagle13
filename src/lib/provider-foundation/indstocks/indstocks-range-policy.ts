// Range planning for INDstocks historical data pagination.
// Splits large requests into provider-legal windows.

import type { Timeframe } from "../types";
import { TIMEFRAME_TO_INDSTOCKS } from "./indstocks-types";

export interface IndstocksRangeChunk {
  readonly from: string; // yyyy-mm-dd
  readonly to: string; // yyyy-mm-dd
}

export interface IndstocksRangePlan {
  readonly ok: boolean;
  readonly reason?: string;
  readonly chunks: readonly IndstocksRangeChunk[];
}

/**
 * Plan legal request windows for a given timeframe and date range.
 * INDstocks limits:
 *   1minute–30minute: 7 days
 *   60minute–240minute: 14 days
 *   1day–1month: 365 days
 */
export function planIndstocksRange(
  timeframe: Timeframe,
  from: string,
  to: string,
): IndstocksRangePlan {
  const interval = TIMEFRAME_TO_INDSTOCKS[timeframe];
  if (!interval) return { ok: false, reason: `unsupported timeframe: ${timeframe}`, chunks: [] };

  const fromDate = parseDate(from);
  const toDate = parseDate(to);
  if (!fromDate || !toDate) return { ok: false, reason: "invalid date format", chunks: [] };
  if (fromDate > toDate) return { ok: false, reason: "from > to", chunks: [] };

  const maxMs = interval.maxWindowDays * 86_400_000;
  const chunks: IndstocksRangeChunk[] = [];
  let cursor = fromDate;

  while (cursor < toDate) {
    const chunkEnd = new Date(Math.min(cursor.getTime() + maxMs, toDate.getTime()));
    chunks.push({
      from: formatDate(cursor),
      to: formatDate(chunkEnd),
    });
    cursor = new Date(chunkEnd.getTime() + 86_400_000); // next day
  }

  return { ok: true, chunks };
}

function parseDate(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + "T00:00:00Z");
  return Number.isFinite(d.getTime()) ? d : null;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
