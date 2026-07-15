// Phase 21.2 · Stage 3 — server function producing the 09:15 IST daily
// Absolute-Degree Intraday snapshot for NIFTY 50 and BANK NIFTY.
// PREVIEW ONLY. Not wired into Signal/Decision/Broker engines.

import { createServerFn } from "@tanstack/react-start";

import {
  INTRADAY_FORMULA_VERSIONS,
  CACHE_NAMESPACE_VERSION,
} from "./engine-version";
import {
  computeSnapshotStatus,
  getTradingSessionAnchor,
  previousTradingDate,
  todayIst,
  type InstrumentSymbol,
  type SessionAnchor,
  type SnapshotStatus,
} from "./gann-intraday-anchor";
import {
  assertAbsoluteDegree,
  GANN_PLANETS,
  type PlanetAbsoluteInput,
} from "./gann-intraday.types";
import {
  buildAbsoluteIntradayLevels,
  type AbsoluteLevelBundle,
} from "./gann-absolute-levels";
import {
  rankLevels,
  type LevelCluster,
  type RankedLevel,
} from "./gann-level-ranking";
import {
  getInstrumentPolicy,
  PROVISIONAL_POLICIES,
} from "./gann-intraday-policy";
import { cached } from "./server-cache";
import { fetchJson } from "./http";
import { YahooChartSchema, parseProvider } from "./providers";

const YAHOO = "https://query1.finance.yahoo.com/v8/finance/chart/";

const INSTRUMENT_SYMBOL: Record<InstrumentSymbol, string> = {
  NIFTY50: "^NSEI",
  BANKNIFTY: "^NSEBANK",
};

export type SnapshotPlanetRow = {
  planet: string;
  siderealAbsoluteLongitude: number;
  degreeWithinSign: number;
  sign: string;
  nakshatra: string;
  pada: number;
  motion: "Direct" | "Retrograde";
  retrograde: boolean;
  /** @deprecated Use siderealAbsoluteLongitude. */
  absDegree: number;
  /** @deprecated Use degreeWithinSign. */
  degree: number;
};

export type IntradaySnapshot = {
  formulaVersion: typeof INTRADAY_FORMULA_VERSIONS.GANN_ASTRO_INTRADAY_ABSOLUTE_V1;
  instrument: InstrumentSymbol;
  tradingDate: string;
  status: SnapshotStatus;
  anchorIst: string;
  anchorUtc: string;
  previousClose: number;
  previousCloseDate: string;
  lowerMultiple: number;
  upperMultiple: number;
  planets: SnapshotPlanetRow[];
  rawLevels: AbsoluteLevelBundle["levels"];
  clusters: LevelCluster[];
  rankedLevels: RankedLevel[];
  nearestSafeBuy: RankedLevel | null;
  nextSafeBuy: RankedLevel | null;
  nearestSafeSell: RankedLevel | null;
  nextSafeSell: RankedLevel | null;
  provisionalPolicies: typeof PROVISIONAL_POLICIES;
  sourceMetadata: {
    priceProvider: "yahoo-finance";
    priceAdjusted: false;
    astronomyEngine: "eaglebaba-astronomia-vsop87";
    ayanamsa: "Lahiri";
  };
  generatedAt: string;
};

function istDate(unixSeconds: number): string {
  return new Date((unixSeconds + 19800) * 1000).toISOString().slice(0, 10);
}

/**
 * Fetch previous completed regular-session close for the given trading date.
 * Skips today and weekends; falls back to the newest available candle strictly
 * before `tradingDate`.
 */
async function fetchPreviousClose(
  instrument: InstrumentSymbol,
  tradingDate: string,
): Promise<{ previousClose: number; previousCloseDate: string }> {
  const symbol = INSTRUMENT_SYMBOL[instrument];
  const url = `${YAHOO}${encodeURIComponent(symbol)}?interval=1d&range=1mo`;
  const json = parseProvider(YahooChartSchema, await fetchJson<unknown>(url), `Yahoo (${symbol})`);
  const result = json.chart.result?.[0];
  if (!result) throw new Error(`No price data for ${symbol}`);
  const ts = result.timestamp ?? [];
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  const rows = ts
    .map((t, i) => ({ close: closes[i] ?? null, date: istDate(t) }))
    .filter((r): r is { close: number; date: string } => r.close != null && r.date < tradingDate);
  if (rows.length === 0) {
    throw new Error(`No completed prior session before ${tradingDate} for ${symbol}`);
  }
  const last = rows[rows.length - 1];
  return {
    previousClose: Math.round(last.close * 100) / 100,
    previousCloseDate: last.date,
  };
}

function buildPlanetInputs(
  anchor: SessionAnchor,
): Promise<{ planets: SnapshotPlanetRow[]; inputs: PlanetAbsoluteInput[] }> {
  return import("./astro-engine.server").then(({ computeAstroPositions }) => {
    const pos = computeAstroPositions(anchor.anchorDate);
    const planets: SnapshotPlanetRow[] = pos.planets.map((p) => ({
      planet: p.planet,
      siderealAbsoluteLongitude: p.absDegree,
      degreeWithinSign: p.degree,
      sign: p.sign,
      nakshatra: p.nakshatra,
      pada: p.pada,
      motion: p.motion,
      retrograde: p.retro,
      absDegree: p.absDegree,
      degree: p.degree,
    }));
    const inputs: PlanetAbsoluteInput[] = GANN_PLANETS.map((name) => {
      const row = planets.find((r) => r.planet === name);
      if (!row) throw new Error(`Astro engine missing planet: ${name}`);
      // Absolute-domain assertion — degreeWithinSign MUST NOT be used here.
      const abs = Math.min(Math.max(row.siderealAbsoluteLongitude, 0), 359.999999);
      return { planet: name, absoluteDegree: assertAbsoluteDegree(name, abs) };
    });
    return { planets, inputs };
  });
}

export type SnapshotArgs = {
  instrument: InstrumentSymbol;
  tradingDate?: string;
};

async function computeSnapshot(args: SnapshotArgs): Promise<IntradaySnapshot> {
  const tradingDate = args.tradingDate ?? todayIst();
  const instrument = args.instrument;
  const status = computeSnapshotStatus(tradingDate);
  const anchor = getTradingSessionAnchor(tradingDate, instrument);

  if (status === "NO_TRADING_SESSION") {
    // Return a shell response so the UI can render the disclosure.
    return {
      formulaVersion: INTRADAY_FORMULA_VERSIONS.GANN_ASTRO_INTRADAY_ABSOLUTE_V1,
      instrument,
      tradingDate,
      status,
      anchorIst: anchor.anchorIst,
      anchorUtc: anchor.anchorUtc,
      previousClose: 0,
      previousCloseDate: previousTradingDate(tradingDate),
      lowerMultiple: 0,
      upperMultiple: 0,
      planets: [],
      rawLevels: [],
      clusters: [],
      rankedLevels: [],
      nearestSafeBuy: null,
      nextSafeBuy: null,
      nearestSafeSell: null,
      nextSafeSell: null,
      provisionalPolicies: PROVISIONAL_POLICIES,
      sourceMetadata: {
        priceProvider: "yahoo-finance",
        priceAdjusted: false,
        astronomyEngine: "eaglebaba-astronomia-vsop87",
        ayanamsa: "Lahiri",
      },
      generatedAt: new Date().toISOString(),
    };
  }

  const [{ previousClose, previousCloseDate }, planetBundle] = await Promise.all([
    fetchPreviousClose(instrument, tradingDate),
    buildPlanetInputs(anchor),
  ]);

  const bundle = buildAbsoluteIntradayLevels({
    instrument,
    previousClose,
    planets: planetBundle.inputs,
  });
  const ranked = rankLevels(instrument, bundle.levels);
  const policy = getInstrumentPolicy(instrument);
  void policy; // documented; consumed inside rankLevels/buildAbsoluteIntradayLevels

  return {
    formulaVersion: INTRADAY_FORMULA_VERSIONS.GANN_ASTRO_INTRADAY_ABSOLUTE_V1,
    instrument,
    tradingDate,
    status,
    anchorIst: anchor.anchorIst,
    anchorUtc: anchor.anchorUtc,
    previousClose,
    previousCloseDate,
    lowerMultiple: bundle.cycles.lowerMultiple,
    upperMultiple: bundle.cycles.upperMultiple,
    planets: planetBundle.planets,
    rawLevels: bundle.levels,
    clusters: ranked.clusters,
    rankedLevels: ranked.ranked,
    nearestSafeBuy: ranked.nearestSafeBuy,
    nextSafeBuy: ranked.nextSafeBuy,
    nearestSafeSell: ranked.nearestSafeSell,
    nextSafeSell: ranked.nextSafeSell,
    provisionalPolicies: PROVISIONAL_POLICIES,
    sourceMetadata: {
      priceProvider: "yahoo-finance",
      priceAdjusted: false,
      astronomyEngine: "eaglebaba-astronomia-vsop87",
      ayanamsa: "Lahiri",
    },
    generatedAt: new Date().toISOString(),
  };
}

function cacheKeyFor(args: SnapshotArgs, tradingDate: string): string {
  return `${CACHE_NAMESPACE_VERSION}:${INTRADAY_FORMULA_VERSIONS.GANN_ASTRO_INTRADAY_ABSOLUTE_V1}:${args.instrument}:${tradingDate}:09-15`;
}

export const getGannIntradaySnapshot = createServerFn({ method: "GET" })
  .inputValidator((input: SnapshotArgs) => {
    if (!input || (input.instrument !== "NIFTY50" && input.instrument !== "BANKNIFTY")) {
      throw new Error("instrument must be NIFTY50 or BANKNIFTY");
    }
    if (input.tradingDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.tradingDate)) {
      throw new Error("tradingDate must be YYYY-MM-DD");
    }
    return input;
  })
  .handler(async ({ data }): Promise<IntradaySnapshot> => {
    const tradingDate = data.tradingDate ?? todayIst();
    const status = computeSnapshotStatus(tradingDate);
    // Immutable cache for LOCKED/HISTORICAL — long TTL. Preview refreshes every minute.
    const ttl =
      status === "LOCKED" || status === "HISTORICAL_LOCKED" ? 12 * 60 * 60_000 : 60_000;
    return cached<IntradaySnapshot>(
      cacheKeyFor(data, tradingDate),
      () => computeSnapshot(data),
      { ttlMs: ttl, swrMs: ttl },
    );
  });

// Test hook — exposes the pure computation without going through the server-fn RPC.
export const _testComputeSnapshot = computeSnapshot;