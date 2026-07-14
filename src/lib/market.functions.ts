import { createServerFn } from "@tanstack/react-start";
import { fetchJson } from "./http";
import { cached } from "./server-cache";
import { YahooChartSchema, parseProvider } from "./providers";

export type OHLC = {
  open: number;
  high: number;
  low: number;
  close: number;
  date: string; // yyyy-mm-dd in IST
};

export type IndexQuote = {
  symbol: string;
  name: string;
  livePrice: number;
  prevSessionClose: number;
  change: number;
  changePct: number;
  marketState: "OPEN" | "CLOSED";
  prevDay: OHLC;
  updatedAt: string;
};

const YAHOO = "https://query1.finance.yahoo.com/v8/finance/chart/";

function istDate(unixSeconds: number): string {
  const d = new Date((unixSeconds + 19800) * 1000);
  return d.toISOString().slice(0, 10);
}

function todayIst(): string {
  const d = new Date(Date.now() + 19800 * 1000);
  return d.toISOString().slice(0, 10);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function fetchIndex(symbol: string): Promise<IndexQuote> {
  const url = `${YAHOO}${encodeURIComponent(symbol)}?interval=1d&range=1mo`;
  const json = parseProvider(YahooChartSchema, await fetchJson<unknown>(url), `Yahoo (${symbol})`);
  const result = json.chart.result?.[0];
  if (!result) throw new Error(`No data for ${symbol}`);

  const meta = result.meta;
  const ts: number[] = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};

  const candles: OHLC[] = ts
    .map((t: number, i: number) => ({
      open: q.open?.[i] ?? null,
      high: q.high?.[i] ?? null,
      low: q.low?.[i] ?? null,
      close: q.close?.[i] ?? null,
      date: istDate(t),
    }))
    .filter(
      (c): c is OHLC =>
        c.open != null && c.high != null && c.low != null && c.close != null,
    );

  if (candles.length === 0) throw new Error(`No candles for ${symbol}`);

  const today = todayIst();
  const last = candles[candles.length - 1];

  let prevIdx = candles.length - 1;
  if (last.date === today) prevIdx = candles.length - 2;
  if (prevIdx < 0) prevIdx = 0;

  const prevDay = candles[prevIdx];
  const sessionBefore = candles[prevIdx - 1] ?? prevDay;

  const livePrice = meta.regularMarketPrice ?? prevDay.close;
  const change = livePrice - prevDay.close;
  const changePct = prevDay.close ? (change / prevDay.close) * 100 : 0;

  return {
    symbol,
    name: meta.shortName ?? symbol,
    livePrice: round2(livePrice),
    prevSessionClose: round2(sessionBefore.close),
    change: round2(change),
    changePct: round2(changePct),
    marketState: last.date === today ? "OPEN" : "CLOSED",
    prevDay: {
      open: round2(prevDay.open),
      high: round2(prevDay.high),
      low: round2(prevDay.low),
      close: round2(prevDay.close),
      date: prevDay.date,
    },
    updatedAt: new Date().toISOString(),
  };
}

export const getMarketData = createServerFn({ method: "GET" }).handler(
  async () =>
    cached(
      "market-data",
      async () => {
    // Core indices are required; secondary instruments degrade gracefully.
    const [niftyR, bankniftyR, vix, btc, gold, silver] = await Promise.all([
      fetchIndex("^NSEI").catch((e) => e as Error),
      fetchIndex("^NSEBANK").catch((e) => e as Error),
      fetchIndex("^INDIAVIX").catch(() => null),
      fetchIndex("BTC-USD").catch(() => null),
      fetchIndex("GC=F").catch(() => null),
      fetchIndex("SI=F").catch(() => null),
    ]);

    if (niftyR instanceof Error && bankniftyR instanceof Error) {
      throw new Error(
        `Live market data is temporarily unavailable. ${niftyR.message}`,
      );
    }
    const nifty = niftyR instanceof Error ? (bankniftyR as IndexQuote) : niftyR;
    const banknifty = bankniftyR instanceof Error ? (niftyR as IndexQuote) : bankniftyR;

    let goldSilverRatio: number | null = null;
    if (gold && silver && silver.livePrice) {
      goldSilverRatio = round2(gold.livePrice / silver.livePrice);
    }

    return { nifty, banknifty, vix, btc, gold, silver, goldSilverRatio };
      },
      { ttlMs: 30_000 },
    ),
);
