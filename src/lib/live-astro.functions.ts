// Live Astro Planet Position Terminal — data layer.
// IMPORTANT: This module ONLY REUSES the existing EagleBaba engine and formulas
// (computeAstroPositions, computeCycles, and the R1/S1 = cycle + degree rule).
// It does not modify any existing calculation. The only difference from the
// daily `getAstro` function is that planetary positions are computed for the
// CURRENT minute (live) instead of the fixed 09:00 IST anchor, so the terminal
// updates every 60 seconds.
import { createServerFn } from "@tanstack/react-start";
import {
  computeCycles,
  computeGannAstroLevels,
  type PlanetRow,
  type MoonPhaseInfo,
} from "./astro-levels";
import { fetchJson } from "./http";
import { cached } from "./server-cache";
import { YahooChartSchema, parseProvider } from "./providers";
import {
  DEFAULT_ASTRO_FORMULA_VERSION,
  astroCacheKey,
  type AstroFormulaVersion,
} from "./engine-version";

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

export type LivePlanet = PlanetRow & { r3: number; s3: number };

export type LiveIndex = {
  symbol: string;
  name: string;
  livePrice: number;
  prevClose: number;
  change: number;
  changePct: number;
  marketState: "OPEN" | "CLOSED";
};

export type LiveAstroData = {
  asOf: string; // ISO of the exact compute moment
  ayanamsa: number;
  formulaVersion: AstroFormulaVersion;
  cycles: { base: number; upper: number; lower: number };
  prevClose: number; // NIFTY previous trading day close
  prevDate: string;
  livePrice: number; // NIFTY live
  marketState: "OPEN" | "CLOSED";
  moonSign: string;
  moonNakshatra: string;
  moonDegree: number;
  retroCount: number;
  bullCount: number;
  bearCount: number;
  bullRetroCount: number;
  bearRetroCount: number;
  planets: LivePlanet[];
  moonPhase: MoonPhaseInfo;
  indices: LiveIndex[];
};

async function fetchIndex(symbol: string, name: string): Promise<LiveIndex> {
  const url = `${YAHOO}${encodeURIComponent(symbol)}?interval=1d&range=1mo`;
  const json = parseProvider(YahooChartSchema, await fetchJson<unknown>(url), `Yahoo (${symbol})`);
  const result = json.chart.result?.[0];
  if (!result) throw new Error(`No data for ${symbol}`);
  const meta = result.meta;
  const ts: number[] = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};
  const candles = ts
    .map((t, i) => ({ close: q.close?.[i] ?? null, date: istDateStr(t) }))
    .filter((c): c is { close: number; date: string } => c.close != null);
  if (candles.length === 0) throw new Error(`No candles for ${symbol}`);

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

  return {
    symbol,
    name,
    livePrice,
    prevClose,
    change,
    changePct,
    marketState: last.date === today ? "OPEN" : "CLOSED",
  };
}

// GANN_NIFTY_ASTRO_V1_1 — R1/R2/S1/S2 come from the SINGLE authoritative
// implementation in astro-levels.ts (Upper/Lower ± degree). R3/S3 are
// EAGLEBABA EXTENDED levels (not part of the original Gann spec) and use
// the legacy ±720 cascade from R1/S1 purely so the existing terminal
// columns keep rendering; they are excluded from core Gann signal math.
function levelsFor(
  cycles: { base: number; upper: number; lower: number },
  degree: number,
) {
  const { r1, r2, s1, s2 } = computeGannAstroLevels(cycles, degree);
  return {
    r1,
    r2,
    s1,
    s2,
    // EagleBaba Extended (legacy) — labeled in UI, not authoritative Gann.
    r3: r1 + 720,
    s3: s1 - 720,
  };
}

export const getLiveAstro = createServerFn({ method: "GET" }).handler(
  async (): Promise<LiveAstroData> =>
    cached<LiveAstroData>(
      astroCacheKey("live-astro"),
      async () => {
    const { computeAstroPositions } = await import("./astro-engine.server");
    // LIVE: positions for the current minute (unchanged formula, live moment).
    const now = new Date();
    const positions = computeAstroPositions(now);

    // Core index required (NIFTY drives the cycles); others degrade gracefully.
    const [nifty, banknifty, finnifty, sensex] = await Promise.all([
      fetchIndex("^NSEI", "NIFTY 50"),
      fetchIndex("^NSEBANK", "BANK NIFTY").catch(() => null),
      fetchIndex("NIFTY_FIN_SERVICE.NS", "FIN NIFTY").catch(() => null),
      fetchIndex("^BSESN", "SENSEX").catch(() => null),
    ]);

    const cycles = computeCycles(nifty.prevClose);
    const planets: LivePlanet[] = positions.planets.map((p) => ({
      ...p,
      ...levelsFor(cycles, p.degree),
    }));

    const indices: LiveIndex[] = [nifty, banknifty, finnifty, sensex].filter(
      (i): i is LiveIndex => i != null,
    );

    return {
      asOf: now.toISOString(),
      ayanamsa: positions.ayanamsa,
      formulaVersion: DEFAULT_ASTRO_FORMULA_VERSION,
      cycles,
      prevClose: nifty.prevClose,
      prevDate: todayIst(),
      livePrice: nifty.livePrice,
      marketState: nifty.marketState,
      moonSign: positions.moonSign,
      moonNakshatra: positions.moonNakshatra,
      moonDegree: positions.moonDegree,
      retroCount: positions.retroCount,
      bullCount: positions.bullCount,
      bearCount: positions.bearCount,
      bullRetroCount: positions.bullRetroCount,
      bearRetroCount: positions.bearRetroCount,
      planets,
      moonPhase: positions.moonPhase,
      indices,
    };
      },
      { ttlMs: 30_000 },
    ),
);
