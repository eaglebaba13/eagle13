import { createServerFn } from "@tanstack/react-start";
import { computeCycles, computeAstroLevels, type PlanetRow, type MoonPhaseInfo } from "./astro-levels";
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

// Anchor planetary positions to today's 9:00 AM IST (Mumbai). IST = UTC+5:30,
// so 09:00 IST is 03:30 UTC of the current IST calendar day. This makes the
// planetary degrees stable through the day and effectively "auto-fetched" once
// daily at 9:00 AM.
function astroAnchorDate(): Date {
  const [y, m, d] = todayIst().split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 3, 30, 0));
}

async function fetchNifty(): Promise<{
  livePrice: number;
  prevClose: number;
  prevDate: string;
  marketState: "OPEN" | "CLOSED";
}> {
  const url = `${YAHOO}${encodeURIComponent("^NSEI")}?interval=1d&range=1mo`;
  const json = (await fetchJson<any>(url)) as any;
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error("No NIFTY data available");
  const meta = result.meta;
  const ts: number[] = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};
  const candles = ts
    .map((t, i) => ({ close: q.close?.[i], date: istDateStr(t) }))
    .filter((c) => c.close != null);
  if (candles.length === 0) throw new Error("No NIFTY candles available");

  const today = todayIst();
  const last = candles[candles.length - 1];
  let prevIdx = candles.length - 1;
  if (last.date === today) prevIdx = candles.length - 2;
  if (prevIdx < 0) prevIdx = 0;
  const prev = candles[prevIdx];

  return {
    livePrice: round2(meta.regularMarketPrice ?? prev.close),
    prevClose: round2(prev.close),
    prevDate: prev.date,
    marketState: last.date === today ? "OPEN" : "CLOSED",
  };
}

export type AstroData = {
  asOf: string;
  ayanamsa: number;
  prevClose: number;
  prevDate: string;
  livePrice: number;
  marketState: "OPEN" | "CLOSED";
  cycles: { base: number; upper: number; lower: number };
  moonSign: string;
  moonNakshatra: string;
  moonDegree: number;
  retroCount: number;
  bullCount: number;
  bearCount: number;
  planets: PlanetRow[];
  moonPhase: MoonPhaseInfo;
};

export const getAstro = createServerFn({ method: "GET" }).handler(
  async (): Promise<AstroData> => {
    const { computeAstroPositions } = await import("./astro-engine.server");
    const anchor = astroAnchorDate();
    const [market, positions] = await Promise.all([
      fetchNifty(),
      Promise.resolve(computeAstroPositions(anchor)),
    ]);

    const cycles = computeCycles(market.prevClose);
    const planets: PlanetRow[] = positions.planets.map((p) => ({
      ...p,
      ...computeAstroLevels(cycles, p.degree),
    }));

    return {
      asOf: anchor.toISOString(),
      ayanamsa: positions.ayanamsa,
      prevClose: market.prevClose,
      prevDate: market.prevDate,
      livePrice: market.livePrice,
      marketState: market.marketState,
      cycles,
      moonSign: positions.moonSign,
      moonNakshatra: positions.moonNakshatra,
      moonDegree: positions.moonDegree,
      retroCount: positions.retroCount,
      bullCount: positions.bullCount,
      bearCount: positions.bearCount,
      planets,
      moonPhase: positions.moonPhase,
    };
  },
);