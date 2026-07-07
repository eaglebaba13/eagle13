// LIVE ASTRO LEVEL TERMINAL — multi-market data layer.
// IMPORTANT: This module ONLY REUSES the existing EagleBaba engine and formulas
// (computeAstroPositions, computeCycles, and the R1/S1 = cycle + degree rule).
// It does NOT modify any existing calculation. Planetary positions are computed
// once for the CURRENT minute (live) and applied — via the unchanged formula —
// to each supported instrument's previous-close cycle.
import { createServerFn } from "@tanstack/react-start";
import { computeCycles, type PlanetRow, type MoonPhaseInfo } from "./astro-levels";
import { fetchJson } from "./http";

const YAHOO = "https://query1.finance.yahoo.com/v8/finance/chart/";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function istDateStr(unixSeconds: number): string {
  return new Date((unixSeconds + 19800) * 1000).toISOString().slice(0, 10);
}
function todayIst(): string {
  return new Date(Date.now() + 19800 * 1000).toISOString().slice(0, 10);
}

export type MarketKey = "NIFTY" | "BANKNIFTY" | "GOLD" | "SILVER" | "BTC";

type MarketDef = {
  key: MarketKey;
  symbol: string;
  name: string;
  currency: string;
  crypto?: boolean;
};

// Supported instruments (Yahoo symbols consistent with existing market layer).
const MARKETS: MarketDef[] = [
  { key: "NIFTY", symbol: "^NSEI", name: "NIFTY 50", currency: "₹" },
  { key: "BANKNIFTY", symbol: "^NSEBANK", name: "BANK NIFTY", currency: "₹" },
  { key: "GOLD", symbol: "GC=F", name: "GOLD", currency: "$" },
  { key: "SILVER", symbol: "SI=F", name: "SILVER", currency: "$" },
  { key: "BTC", symbol: "BTC-USD", name: "BITCOIN", currency: "$", crypto: true },
];

export type MarketPlanet = PlanetRow & { r3: number; s3: number };

export type MarketBlock = {
  key: MarketKey;
  name: string;
  symbol: string;
  currency: string;
  crypto: boolean;
  livePrice: number;
  prevClose: number;
  prevDate: string;
  change: number;
  changePct: number;
  marketState: "OPEN" | "CLOSED";
  cycles: { base: number; upper: number; lower: number };
  planets: MarketPlanet[];
};

export type LiveLevelsData = {
  asOf: string; // ISO of the exact compute moment
  ayanamsa: number;
  moonSign: string;
  moonNakshatra: string;
  moonDegree: number;
  retroCount: number;
  bullCount: number;
  bearCount: number;
  bullRetroCount: number;
  bearRetroCount: number;
  // Shared base planetary positions (same for every instrument).
  planets: Omit<PlanetRow, "r1" | "s1" | "r2" | "s2">[];
  moonPhase: MoonPhaseInfo;
  markets: MarketBlock[];
};

type Quote = {
  livePrice: number;
  prevClose: number;
  prevDate: string;
  change: number;
  changePct: number;
  marketState: "OPEN" | "CLOSED";
};

async function fetchQuote(def: MarketDef): Promise<Quote> {
  const url = `${YAHOO}${encodeURIComponent(def.symbol)}?interval=1d&range=1mo`;
  const json = (await fetchJson<any>(url)) as any;
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`No data for ${def.symbol}`);
  const meta = result.meta;
  const ts: number[] = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};
  const candles = ts
    .map((t, i) => ({ close: q.close?.[i], date: istDateStr(t) }))
    .filter((c) => c.close != null);
  if (candles.length === 0) throw new Error(`No candles for ${def.symbol}`);

  const today = todayIst();
  const last = candles[candles.length - 1];
  let prevIdx = candles.length - 1;
  if (last.date === today) prevIdx = candles.length - 2;
  if (prevIdx < 0) prevIdx = 0;
  const prev = candles[prevIdx];

  const livePrice = round2(meta.regularMarketPrice ?? prev.close);
  const prevClose = round2(prev.close as number);
  const change = round2(livePrice - prevClose);
  const changePct = prevClose ? round2((change / prevClose) * 100) : 0;

  // Crypto trades 24/7 → treat as OPEN; equities OPEN only if today's candle exists.
  const marketState: "OPEN" | "CLOSED" =
    def.crypto || last.date === today ? "OPEN" : "CLOSED";

  return { livePrice, prevClose, prevDate: prev.date, change, changePct, marketState };
}

// R1/S1 use the EXISTING EagleBaba rule (Upper/Lower cycle + planet degree).
// R2/R3/S2/S3 follow the spec's +360 / -360 cascade from R1/S1.
function levelsFor(cycles: { upper: number; lower: number }, degree: number) {
  const r1 = Math.round(cycles.upper + degree);
  const s1 = Math.round(cycles.lower + degree);
  return { r1, s1, r2: r1 + 360, r3: r1 + 720, s2: s1 - 360, s3: s1 - 720 };
}

export const getLiveLevels = createServerFn({ method: "GET" }).handler(
  async (): Promise<LiveLevelsData> => {
    const { computeAstroPositions } = await import("./astro-engine.server");
    // LIVE: positions for the current minute (unchanged formula, live moment).
    const now = new Date();
    const positions = computeAstroPositions(now);

    const quotes = await Promise.all(
      MARKETS.map((def) =>
        fetchQuote(def)
          .then((q) => ({ def, q }))
          .catch(() => null),
      ),
    );

    const markets: MarketBlock[] = quotes
      .filter((x): x is { def: MarketDef; q: Quote } => x != null)
      .map(({ def, q }) => {
        const cycles = computeCycles(q.prevClose);
        const planets: MarketPlanet[] = positions.planets.map((p) => ({
          ...p,
          ...levelsFor(cycles, p.degree),
        }));
        return {
          key: def.key,
          name: def.name,
          symbol: def.symbol,
          currency: def.currency,
          crypto: !!def.crypto,
          livePrice: q.livePrice,
          prevClose: q.prevClose,
          prevDate: q.prevDate,
          change: q.change,
          changePct: q.changePct,
          marketState: q.marketState,
          cycles,
          planets,
        };
      });

    if (markets.length === 0) throw new Error("No market data available");

    return {
      asOf: now.toISOString(),
      ayanamsa: positions.ayanamsa,
      moonSign: positions.moonSign,
      moonNakshatra: positions.moonNakshatra,
      moonDegree: positions.moonDegree,
      retroCount: positions.retroCount,
      bullCount: positions.bullCount,
      bearCount: positions.bearCount,
      bullRetroCount: positions.bullRetroCount,
      bearRetroCount: positions.bearRetroCount,
      planets: positions.planets,
      moonPhase: positions.moonPhase,
      markets,
    };
  },
);
