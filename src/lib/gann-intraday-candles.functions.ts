// Phase 21.2 · Stage 4 — 5-minute candle fetch for validation runs.
// Session-scoped to the Asia/Kolkata regular trading window
// [09:15, 15:30). NEVER emits future candles relative to the request time.
// Cached independently from the Astro snapshot.

import { createServerFn } from "@tanstack/react-start";
import { CACHE_NAMESPACE_VERSION } from "./engine-version";
import { cached } from "./server-cache";
import { fetchJson } from "./http";
import { YahooChartSchema, parseProvider } from "./providers";
import {
  computeSnapshotStatus,
  parseIstDateAt0915,
  type InstrumentSymbol,
} from "./gann-intraday-anchor";
import type { TimedCandle5m } from "./gann-intraday-touch";

const YAHOO = "https://query1.finance.yahoo.com/v8/finance/chart/";
const INSTRUMENT_SYMBOL: Record<InstrumentSymbol, string> = {
  NIFTY50: "^NSEI",
  BANKNIFTY: "^NSEBANK",
};

const SESSION_START_MIN = 9 * 60 + 15; // 09:15 IST
const SESSION_END_MIN = 15 * 60 + 30; // 15:30 IST (exclusive)
const EXPECTED_CANDLES = (SESSION_END_MIN - SESSION_START_MIN) / 5; // 75

function toIstIso(unixSeconds: number): { iso: string; minuteOfDay: number; dateStr: string } {
  const d = new Date((unixSeconds + 19800) * 1000); // add 5h30m
  const iso = d.toISOString().replace("Z", "+05:30");
  const minuteOfDay = d.getUTCHours() * 60 + d.getUTCMinutes();
  const dateStr = d.toISOString().slice(0, 10);
  return { iso, minuteOfDay, dateStr };
}

export type CandleFetchArgs = {
  instrument: InstrumentSymbol;
  sessionDate: string;
};

export type CandleFetchResult = {
  instrument: InstrumentSymbol;
  sessionDate: string;
  provider: "yahoo-finance-5m";
  candles: TimedCandle5m[];
  expectedCount: number;
  missingCount: number;
  gaps: Array<{ startIst: string; endIst: string }>;
  fetchedAt: string;
  sessionStatus: string;
};

async function fetchSessionCandles(
  args: CandleFetchArgs,
): Promise<CandleFetchResult> {
  const symbol = INSTRUMENT_SYMBOL[args.instrument];
  const anchor = parseIstDateAt0915(args.sessionDate);
  const from = Math.floor(anchor.getTime() / 1000);
  const to = from + 6 * 60 * 60; // 09:15 → 15:15 = 6h window; +15m buffer
  const url = `${YAHOO}${encodeURIComponent(symbol)}?interval=5m&period1=${from}&period2=${to + 15 * 60}`;
  const json = parseProvider(
    YahooChartSchema,
    await fetchJson<unknown>(url),
    `Yahoo 5m (${symbol})`,
  );
  const result = json.chart.result?.[0];
  const ts = result?.timestamp ?? [];
  const q = result?.indicators?.quote?.[0] ?? {};
  const now = Date.now();

  const candles: TimedCandle5m[] = [];
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i];
    const openTimeMs = t * 1000;
    if (openTimeMs > now) continue; // no future
    const { iso, minuteOfDay, dateStr } = toIstIso(t);
    if (dateStr !== args.sessionDate) continue; // no other session
    if (minuteOfDay < SESSION_START_MIN) continue; // no pre-open
    if (minuteOfDay >= SESSION_END_MIN) continue; // no post-market
    const o = q.open?.[i];
    const h = q.high?.[i];
    const l = q.low?.[i];
    const c = q.close?.[i];
    if (o == null || h == null || l == null || c == null) continue;
    candles.push({ timeIst: iso, openTimeMs, open: o, high: h, low: l, close: c });
  }
  candles.sort((a, b) => a.openTimeMs - b.openTimeMs);

  // Detect gaps within the observed window.
  const gaps: Array<{ startIst: string; endIst: string }> = [];
  for (let i = 1; i < candles.length; i++) {
    const delta = candles[i].openTimeMs - candles[i - 1].openTimeMs;
    if (delta > 5 * 60_000 + 30_000) {
      gaps.push({
        startIst: candles[i - 1].timeIst,
        endIst: candles[i].timeIst,
      });
    }
  }
  return {
    instrument: args.instrument,
    sessionDate: args.sessionDate,
    provider: "yahoo-finance-5m",
    candles,
    expectedCount: EXPECTED_CANDLES,
    missingCount: Math.max(0, EXPECTED_CANDLES - candles.length),
    gaps,
    fetchedAt: new Date().toISOString(),
    sessionStatus: computeSnapshotStatus(args.sessionDate),
  };
}

export const getIntraday5mCandles = createServerFn({ method: "GET" })
  .inputValidator((input: CandleFetchArgs) => {
    if (!input || (input.instrument !== "NIFTY50" && input.instrument !== "BANKNIFTY")) {
      throw new Error("instrument must be NIFTY50 or BANKNIFTY");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.sessionDate)) {
      throw new Error("sessionDate must be YYYY-MM-DD");
    }
    return input;
  })
  .handler(async ({ data }): Promise<CandleFetchResult> => {
    const key = `${CACHE_NAMESPACE_VERSION}:gann-abs-5m:${data.instrument}:${data.sessionDate}`;
    const status = computeSnapshotStatus(data.sessionDate);
    // Historical sessions never change — long TTL. Live sessions refresh often.
    const ttl = status === "HISTORICAL_LOCKED" ? 12 * 60 * 60_000 : 60_000;
    return cached<CandleFetchResult>(key, () => fetchSessionCandles(data), {
      ttlMs: ttl,
      swrMs: ttl,
    });
  });

// Test/preview hook — bypasses caching for deterministic assertions.
export const _testFetchSessionCandles = fetchSessionCandles;