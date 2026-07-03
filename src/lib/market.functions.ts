import { createServerFn } from "@tanstack/react-start";

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
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`Data source error ${res.status} for ${symbol}`);

  const json = (await res.json()) as any;
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`No data for ${symbol}`);

  const meta = result.meta;
  const ts: number[] = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};

  const candles: OHLC[] = ts
    .map((t: number, i: number) => ({
      open: q.open?.[i],
      high: q.high?.[i],
      low: q.low?.[i],
      close: q.close?.[i],
      date: istDate(t),
    }))
    .filter(
      (c: OHLC) =>
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
  async () => {
    const [nifty, banknifty, vix] = await Promise.all([
      fetchIndex("^NSEI"),
      fetchIndex("^NSEBANK"),
      fetchIndex("^INDIAVIX").catch(() => null),
    ]);
    return { nifty, banknifty, vix };
  },
);
