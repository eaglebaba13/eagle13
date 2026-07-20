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

export type MarketDataResponse = {
  nifty: IndexQuote;
  banknifty: IndexQuote;
  vix: IndexQuote | null;
  btc: IndexQuote | null;
  gold: IndexQuote | null;
  silver: IndexQuote | null;
  goldSilverRatio: number | null;
  providerMetadata?: {
    nifty: { name: string; status: string; receivedAt: string; providerTime: string | null };
    banknifty: { name: string; status: string; receivedAt: string; providerTime: string | null };
    vix: { name: string; status: string; receivedAt: string; providerTime: string | null };
  };
};

export const getMarketData = createServerFn({ method: "GET" }).handler(
  async (): Promise<MarketDataResponse> =>
    cached<MarketDataResponse>(
      "market-data",
      async () => {
    // Phase 36.3 — Upstox is canonical for NIFTY / BANKNIFTY / INDIA VIX.
    // Yahoo is called only when the Upstox path fails, so successful
    // Upstox responses do NOT trigger a background Yahoo request. Gold
    // and Silver remain on Yahoo as the retained historical/commodity
    // provider (no Upstox spot equivalent — see provider-routing-matrix).
    const { fetchUpstoxIndexQuote } = await import("./upstox-market-data.server");
    const nowIso = new Date().toISOString();
    const [uxNifty, uxBank, uxVix] = await Promise.all([
      fetchUpstoxIndexQuote("NIFTY50", nowIso).catch(() => null),
      fetchUpstoxIndexQuote("BANKNIFTY", nowIso).catch(() => null),
      fetchUpstoxIndexQuote("INDIA_VIX", nowIso).catch(() => null),
    ]);

    const upstoxNiftyQuote = uxNifty && uxNifty.ok ? uxNifty.quote : null;
    const upstoxBankQuote = uxBank && uxBank.ok ? uxBank.quote : null;
    const upstoxVixQuote = uxVix && uxVix.ok ? uxVix.quote : null;

    // Lazy Yahoo fallback — only when the primary Upstox path failed.
    const needsNifty = upstoxNiftyQuote == null;
    const needsBank = upstoxBankQuote == null;
    const needsVix = upstoxVixQuote == null;
    const [yNifty, yBank, yVix, goldR, silverR] = await Promise.all([
      needsNifty ? fetchIndex("^NSEI").catch((e) => e as Error) : Promise.resolve(null),
      needsBank ? fetchIndex("^NSEBANK").catch((e) => e as Error) : Promise.resolve(null),
      needsVix ? fetchIndex("^INDIAVIX").catch(() => null) : Promise.resolve(null),
      fetchIndex("GC=F").catch(() => null),
      fetchIndex("SI=F").catch(() => null),
    ]);
    const yahooNifty = yNifty instanceof Error ? null : yNifty;
    const yahooBank = yBank instanceof Error ? null : yBank;

    const nifty = upstoxNiftyQuote ?? yahooNifty ?? (yahooBank ?? null);
    const banknifty = upstoxBankQuote ?? yahooBank ?? (yahooNifty ?? null);
    const vix: IndexQuote | null = upstoxVixQuote ?? yVix ?? null;
    const btc: IndexQuote | null = null;
    const gold: IndexQuote | null = goldR;
    const silver: IndexQuote | null = silverR;

    if (!nifty || !banknifty) {
      const msg = yNifty instanceof Error ? yNifty.message : "provider unavailable";
      throw new Error(`Live market data is temporarily unavailable. ${msg}`);
    }

    const goldSilverRatio: number | null =
      gold && silver && silver.livePrice > 0
        ? Math.round((gold.livePrice / silver.livePrice) * 100) / 100
        : null;

    const nowStamp = new Date().toISOString();
    const fallbackMeta = (reason: string) => ({
      name: `yahoo-fallback (${reason})`,
      status: "DELAYED" as const,
      receivedAt: nowStamp,
      providerTime: null,
    });
    const providerMetadata = {
      nifty: uxNifty && uxNifty.ok
        ? uxNifty.providerMetadata
        : fallbackMeta(uxNifty && !uxNifty.ok ? uxNifty.reason : "upstox-unavailable"),
      banknifty: uxBank && uxBank.ok
        ? uxBank.providerMetadata
        : fallbackMeta(uxBank && !uxBank.ok ? uxBank.reason : "upstox-unavailable"),
      vix: uxVix && uxVix.ok
        ? uxVix.providerMetadata
        : fallbackMeta(uxVix && !uxVix.ok ? uxVix.reason : "upstox-unavailable"),
    };

    return { nifty, banknifty, vix, btc, gold, silver, goldSilverRatio, providerMetadata };
      },
      { ttlMs: 30_000 },
    ),
);
