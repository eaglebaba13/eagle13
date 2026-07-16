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
    // Phase 26 · Stage 4 — Prefer Upstox for NIFTY/BANKNIFTY/VIX. Fall
    // back to Yahoo when Upstox is unavailable. Hidden markets (BTC,
    // GOLD, SILVER) are set to null — dashboards render them as
    // COMING SOON. No mock values, ever.
    const { fetchUpstoxIndexQuote } = await import("./upstox-market-data.server");
    const nowIso = new Date().toISOString();
    const [uxNifty, uxBank, uxVix, niftyR, bankniftyR, vixYahoo] = await Promise.all([
      fetchUpstoxIndexQuote("NIFTY50", nowIso).catch(() => null),
      fetchUpstoxIndexQuote("BANKNIFTY", nowIso).catch(() => null),
      fetchUpstoxIndexQuote("INDIA_VIX", nowIso).catch(() => null),
      fetchIndex("^NSEI").catch((e) => e as Error),
      fetchIndex("^NSEBANK").catch((e) => e as Error),
      fetchIndex("^INDIAVIX").catch(() => null),
    ]);
    const vix: IndexQuote | null = uxVix && uxVix.ok ? uxVix.quote : vixYahoo;
    const btc: IndexQuote | null = null;
    const gold: IndexQuote | null = null;
    const silver: IndexQuote | null = null;

    const niftyFallback = niftyR instanceof Error ? null : niftyR;
    const bankFallback = bankniftyR instanceof Error ? null : bankniftyR;
    const nifty =
      (uxNifty && uxNifty.ok ? uxNifty.quote : null) ??
      niftyFallback ??
      bankFallback;
    const banknifty =
      (uxBank && uxBank.ok ? uxBank.quote : null) ??
      bankFallback ??
      niftyFallback;
    if (!nifty || !banknifty) {
      const msg = niftyR instanceof Error ? niftyR.message : "provider unavailable";
      throw new Error(`Live market data is temporarily unavailable. ${msg}`);
    }

    const goldSilverRatio: number | null = null;

    const providerMetadata = {
      nifty: uxNifty && uxNifty.ok ? uxNifty.providerMetadata : { name: "yahoo-fallback", status: "DELAYED", receivedAt: new Date().toISOString(), providerTime: null },
      banknifty: uxBank && uxBank.ok ? uxBank.providerMetadata : { name: "yahoo-fallback", status: "DELAYED", receivedAt: new Date().toISOString(), providerTime: null },
      vix: uxVix && uxVix.ok ? uxVix.providerMetadata : { name: "yahoo-fallback", status: "DELAYED", receivedAt: new Date().toISOString(), providerTime: null },
    };

    return { nifty, banknifty, vix, btc, gold, silver, goldSilverRatio, providerMetadata };
      },
      { ttlMs: 30_000 },
    ),
);
