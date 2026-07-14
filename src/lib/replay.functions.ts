// INTRADAY MARKET REPLAY — server data layer.
//
// This module REUSES the production engines and does not redefine any
// business rule:
//   • computeAstroPositions      → astro-engine.server.ts
//   • computeCycles              → astro-levels.ts
//   • computeAstroLevels         → astro-levels.ts (R1/R2/S1/S2 for signal)
//   • buildLevelBoard, computeSignal → astro-levels.ts (unchanged)
//
// Only the intraday candle fetcher + prev-daily-close resolver live here.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchJson } from "./http";
import { YahooChartSchema, parseProvider } from "./providers";
import { cached } from "./server-cache";
import {
  computeCycles,
  computeAstroLevels,
  type PlanetRow,
  type MoonPhaseInfo,
} from "./astro-levels";
import type { Candle, Timeframe } from "./replay-engine";
import {
  REPLAY_ENGINE_VERSION,
  REPLAY_FORMULA_VERSION,
  computeReplayRunId,
} from "./replay-engine";

const YAHOO = "https://query1.finance.yahoo.com/v8/finance/chart/";

export const REPLAY_SYMBOLS = {
  NIFTY50:   { yahoo: "^NSEI",     label: "NIFTY 50",   currency: "₹", session: "NSE" },
  BANKNIFTY: { yahoo: "^NSEBANK",  label: "BANK NIFTY", currency: "₹", session: "NSE" },
  GOLD:      { yahoo: "GC=F",      label: "GOLD",       currency: "$", session: "MCX" },
  SILVER:    { yahoo: "SI=F",      label: "SILVER",     currency: "$", session: "MCX" },
  BTC:       { yahoo: "BTC-USD",   label: "BITCOIN",    currency: "$", session: "CRYPTO" },
} as const;
export type ReplaySymbol = keyof typeof REPLAY_SYMBOLS;

// R3/S3 come from the same +/- 360 cascade already used in live-levels;
// they are display-only. Signal generation continues to use the production
// 4-level board from computeAstroLevels (identical to backtest & live).
export type ReplayPlanet = PlanetRow & { r3: number; s3: number };

export type ReplaySession = {
  symbol: ReplaySymbol;
  yahooSymbol: string;
  label: string;
  currency: string;
  sessionType: "NSE" | "MCX" | "CRYPTO";
  date: string;                 // yyyy-mm-dd
  timezone: string;
  timeframe: Timeframe;
  provider: string;
  interval: string;             // provider-native interval
  candles: Candle[];            // in session-window (may be empty if no data)
  prevClose: number;
  prevDate: string;
  sessionStartTs: number;
  sessionEndTs: number;
  cycles: { base: number; upper: number; lower: number };
  planets: ReplayPlanet[];      // planets with all six levels
  moonSign: string;
  moonNakshatra: string;
  moonDegree: number;
  retroCount: number;
  bullRetroCount: number;
  bearRetroCount: number;
  moonPhase: MoonPhaseInfo;
  ayanamsa: number;
  runId: string;
  engineVersion: string;
  formulaVersion: string;
  dataQuality: {
    expected: number;
    loaded: number;
    missing: number;
    coveragePct: number;
    limitationNote: string;
  };
  disclaimers: string[];
};

const TF_SCHEMA = z.enum(["1m", "3m", "5m", "15m", "30m", "60m"]);
const InputSchema = z.object({
  symbol: z.enum(["NIFTY50", "BANKNIFTY", "GOLD", "SILVER", "BTC"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeframe: TF_SCHEMA,
});
type ReplayInput = z.infer<typeof InputSchema>;

// Map replay timeframe to Yahoo native interval; 3m must be aggregated from 1m.
function providerInterval(tf: Timeframe): string {
  return tf === "3m" ? "1m" : tf;
}

function tfSeconds(tf: Timeframe): number {
  return { "1m": 60, "3m": 180, "5m": 300, "15m": 900, "30m": 1800, "60m": 3600 }[tf];
}

// Session window in unix seconds for a given yyyy-mm-dd.
function sessionWindow(symbol: ReplaySymbol, dateIso: string):
  { start: number; end: number; tz: string } {
  const [y, m, d] = dateIso.split("-").map(Number);
  const utcMidnight = Date.UTC(y, m - 1, d, 0, 0, 0) / 1000;
  if (symbol === "BTC") {
    return { start: utcMidnight, end: utcMidnight + 86_399, tz: "UTC" };
  }
  if (symbol === "GOLD" || symbol === "SILVER") {
    // MCX session (approx): 09:00 – 23:30 IST. IST = UTC+5:30.
    return {
      start: utcMidnight + (9 * 3600) - (5 * 3600 + 1800),
      end: utcMidnight + (23 * 3600 + 1800) - (5 * 3600 + 1800),
      tz: "Asia/Kolkata",
    };
  }
  // NSE: 09:15 – 15:30 IST.
  return {
    start: utcMidnight + (9 * 3600 + 15 * 60) - (5 * 3600 + 1800),
    end: utcMidnight + (15 * 3600 + 30 * 60) - (5 * 3600 + 1800),
    tz: "Asia/Kolkata",
  };
}

async function fetchIntraday(
  yahooSymbol: string,
  startSec: number,
  endSec: number,
  interval: string,
): Promise<Candle[]> {
  const url =
    `${YAHOO}${encodeURIComponent(yahooSymbol)}` +
    `?interval=${interval}&period1=${startSec}&period2=${endSec}&includePrePost=false`;
  const json = parseProvider(YahooChartSchema, await fetchJson<unknown>(url), `Yahoo intraday (${yahooSymbol})`);
  const result = json.chart.result?.[0];
  if (!result) return [];
  const ts = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};
  const rawVol = (q as { volume?: (number | null)[] }).volume ?? [];
  const out: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
    if (o == null || h == null || l == null || c == null) continue;
    out.push({
      ts: ts[i] * 1000,
      open: o, high: h, low: l, close: c,
      volume: (rawVol[i] as number | null) ?? 0,
    });
  }
  return out;
}

// Aggregate 1m candles into 3m buckets in wall-clock alignment.
function aggregateTo3m(candles: Candle[]): Candle[] {
  if (candles.length === 0) return [];
  const out: Candle[] = [];
  const bucketMs = 3 * 60 * 1000;
  let acc: Candle | null = null;
  let bucketStart = 0;
  for (const c of candles) {
    const start = Math.floor(c.ts / bucketMs) * bucketMs;
    if (!acc || start !== bucketStart) {
      if (acc) out.push(acc);
      acc = { ts: start, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume };
      bucketStart = start;
    } else {
      acc.high = Math.max(acc.high, c.high);
      acc.low = Math.min(acc.low, c.low);
      acc.close = c.close;
      acc.volume += c.volume;
    }
  }
  if (acc) out.push(acc);
  return out;
}

async function fetchPrevDailyClose(
  yahooSymbol: string, dateIso: string,
): Promise<{ close: number; date: string } | null> {
  const [y, m, d] = dateIso.split("-").map(Number);
  const endUtc = Math.floor(Date.UTC(y, m - 1, d, 0, 0, 0) / 1000);
  const startUtc = endUtc - 20 * 86_400;
  const url =
    `${YAHOO}${encodeURIComponent(yahooSymbol)}` +
    `?interval=1d&period1=${startUtc}&period2=${endUtc}`;
  const json = parseProvider(YahooChartSchema, await fetchJson<unknown>(url), `Yahoo daily (${yahooSymbol})`);
  const result = json.chart.result?.[0];
  if (!result) return null;
  const ts = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};
  for (let i = ts.length - 1; i >= 0; i--) {
    const c = q.close?.[i];
    if (c != null) {
      const date = new Date((ts[i] + 19800) * 1000).toISOString().slice(0, 10);
      if (date < dateIso) return { close: c, date };
    }
  }
  return null;
}

function levelsFor(cycles: { upper: number; lower: number }, degree: number) {
  const base = computeAstroLevels({ base: 0, upper: cycles.upper, lower: cycles.lower }, degree);
  // Extend with R3/S3 using the same live-levels cascade (display only).
  return {
    ...base,
    r3: Math.round(cycles.upper + degree) + 720,
    s3: Math.round(cycles.lower + degree) - 720,
  };
}

function round2(n: number): number { return Math.round(n * 100) / 100; }

export const loadReplaySession = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }: { data: ReplayInput }): Promise<ReplaySession> =>
    cached<ReplaySession>(
      `replay:${data.symbol}:${data.date}:${data.timeframe}`,
      async () => {
        const map = REPLAY_SYMBOLS[data.symbol];
        const win = sessionWindow(data.symbol, data.date);
        const interval = providerInterval(data.timeframe);

        const rawCandles = await fetchIntraday(map.yahoo, win.start, win.end, interval);
        const filtered = rawCandles.filter((c) => c.ts >= win.start * 1000 && c.ts <= win.end * 1000);
        const candles = data.timeframe === "3m" ? aggregateTo3m(filtered) : filtered;

        const prev = await fetchPrevDailyClose(map.yahoo, data.date);
        const prevClose = prev?.close ?? candles[0]?.open ?? 0;
        const prevDate = prev?.date ?? "unknown";

        const cycles = computeCycles(prevClose);

        // Astro anchor: 09:00 IST for equities/commodities, 00:00 UTC for BTC.
        // Same anchor policy as the backtest engine.
        const [yy, mm, dd] = data.date.split("-").map(Number);
        const anchorMs = data.symbol === "BTC"
          ? Date.UTC(yy, mm - 1, dd, 0, 0, 0)
          : Date.UTC(yy, mm - 1, dd, 3, 30, 0); // 09:00 IST
        const { computeAstroPositions } = await import("./astro-engine.server");
        const positions = computeAstroPositions(new Date(anchorMs));

        const planets: ReplayPlanet[] = positions.planets.map((p) => ({
          ...p,
          ...levelsFor(cycles, p.degree),
        }));

        const expected = Math.floor((win.end - win.start) / tfSeconds(data.timeframe));
        const loaded = candles.length;
        const missing = Math.max(0, expected - loaded);
        const coveragePct = expected > 0 ? round2((loaded / expected) * 100) : 0;

        const provider = "yahoo";
        const runId = computeReplayRunId({
          symbol: data.symbol,
          date: data.date,
          timeframe: data.timeframe,
          provider,
          entryMode: "next_open",
          policy: "conservative",
          costs: { slippagePct: 0, brokerageFlat: 0, brokeragePct: 0 },
        });

        const limitationNote =
          data.timeframe === "1m"
            ? "Yahoo 1m intraday is limited to the last ~7 days. Older dates return no data."
            : data.timeframe === "3m"
              ? "3m candles are aggregated from Yahoo 1m — same 7-day limit."
              : data.timeframe === "5m"
                ? "Yahoo 5m intraday is limited to the last ~60 days."
                : "Yahoo 15m / 30m / 60m intraday is limited to the last ~730 days.";

        return {
          symbol: data.symbol,
          yahooSymbol: map.yahoo,
          label: map.label,
          currency: map.currency,
          sessionType: map.session,
          date: data.date,
          timezone: win.tz,
          timeframe: data.timeframe,
          provider,
          interval,
          candles,
          prevClose: round2(prevClose),
          prevDate,
          sessionStartTs: win.start * 1000,
          sessionEndTs: win.end * 1000,
          cycles,
          planets,
          moonSign: positions.moonSign,
          moonNakshatra: positions.moonNakshatra,
          moonDegree: positions.moonDegree,
          retroCount: positions.retroCount,
          bullRetroCount: positions.bullRetroCount,
          bearRetroCount: positions.bearRetroCount,
          moonPhase: positions.moonPhase,
          ayanamsa: positions.ayanamsa,
          runId,
          engineVersion: REPLAY_ENGINE_VERSION,
          formulaVersion: REPLAY_FORMULA_VERSION,
          dataQuality: { expected, loaded, missing, coveragePct, limitationNote },
          disclaimers: [
            "Replay results are simulated and depend on candle resolution, execution assumptions, data quality, slippage, and costs.",
            "Astro state is anchored at session open — identical to the live signal engine and historical backtest.",
            "Provider: Yahoo Finance (public chart endpoint). Some sessions or minute-precision windows may be unavailable.",
          ],
        };
      },
      { ttlMs: 6 * 3600_000, swrMs: 18 * 3600_000 },
    ),
  );