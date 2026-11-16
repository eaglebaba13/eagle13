import { createServerFn } from "@tanstack/react-start";
import { cached } from "./server-cache";
import { fetchJson } from "./http";
import { YahooChartSchema, parseProvider } from "./providers";
import { computeEma } from "./strategy-math";
import { calculateRsi } from "./indicators/rsi";
import {
  computeHtGannIntraV2Matrix,
  evaluatePillar2Starwise,
  evaluatePillar3Retrograde,
  evaluatePillar4Aspects,
  evaluateMasterCube,
  type IntradayMatrixResult,
  type Pillar2StarwiseResult,
  type Pillar3RetrogradeResult,
  type Pillar4AspectResult,
  type MasterCubeVerdict,
  type PlanetPositionInput,
  type HTGannPlanet,
} from "./astro/ht-gann-intra-v2";

const YAHOO = "https://query1.finance.yahoo.com/v8/finance/chart/";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseIstAnchor(dateStr?: string): Date {
  if (dateStr) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) ||
        !Number.isFinite(Date.parse(`${dateStr}T00:00:00Z`)) ||
        new Date(`${dateStr}T00:00:00Z`).toISOString().slice(0, 10) !== dateStr) {
      throw new Error("Target Date must be a valid YYYY-MM-DD date");
    }
    const parts = dateStr.slice(0, 10).split("-").map(Number);
    if (parts.length === 3 && parts.every((n) => !Number.isNaN(n))) {
      // 09:15:00 IST is 03:45:00 UTC
      return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 3, 45, 0));
    }
  }
  const now = new Date(Date.now() + 19800 * 1000);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  return new Date(Date.UTC(y, m, d, 3, 45, 0));
}

export async function fetchIndexDailyData(symbol: "NIFTY" | "BANKNIFTY", targetDateStr: string, now = new Date()): Promise<{
  livePrice: number;
  prevClose: number;
  prevHigh: number;
  prevLow: number;
  ema13: number | null;
  rsi14: number | null;
  dateStr: string;
  sessionDate: string;
  starDayHigh: number;
  starDayLow: number;
  historical: boolean;
}> {
  parseIstAnchor(targetDateStr);
  const istNow = new Date(now.getTime() + 19800_000);
  const today = istNow.toISOString().slice(0, 10);
  // Today always follows live semantics; future projections use data available now.
  const historical = targetDateStr < today;
  const toDate = historical ? targetDateStr : today;
  const from = new Date(`${toDate}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 90);
  const fromDate = from.toISOString().slice(0, 10);
  const instrumentKey = symbol === "BANKNIFTY" ? "NSE_INDEX|Nifty Bank" : "NSE_INDEX|Nifty 50";
  const { UpstoxHttpClient } = await import("./provider-foundation/upstox/upstox-http.server");
  const client = new UpstoxHttpClient();
  type CandleResponse = { status?: string; data?: { candles?: unknown[][] } };
  let response = await client.request<CandleResponse>({
    path: `v2/historical-candle/${encodeURIComponent(instrumentKey)}/day/${toDate}/${fromDate}`,
  });
  // V3 also supports older daily history (back to 2000).
  if (!response.ok || !response.data.data?.candles?.length) {
    response = await client.request<CandleResponse>({
      path: `v3/historical-candle/${encodeURIComponent(instrumentKey)}/days/1/${toDate}/${fromDate}`,
    });
  }
  if (!response.ok || !Array.isArray(response.data.data?.candles)) {
    throw new Error(`Historical daily candles unavailable for ${symbol} on ${toDate}`);
  }
  const byDate = new Map<string, { date: string; time: number; open: number; high: number; low: number; close: number; volume: number }>();
  for (const row of response.data.data.candles) {
    if (!Array.isArray(row) || row.length < 5) continue;
    const timestamp = typeof row[0] === "string" ? Date.parse(row[0]) : NaN;
    const [open, high, low, close] = row.slice(1, 5);
    if (!Number.isFinite(timestamp) ||
        ![open, high, low, close].every((n) => typeof n === "number" && Number.isFinite(n) && n > 0)) continue;
    const date = new Date(timestamp + 19800_000).toISOString().slice(0, 10);
    if (date < fromDate || date > toDate || (high as number) < (low as number)) continue;
    byDate.set(date, { date, time: timestamp / 1000, open: open as number, high: high as number,
      low: low as number, close: close as number, volume: typeof row[5] === "number" ? row[5] : 0 });
  }
  const candles = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const current = candles.at(-1);
  if (!current || candles.length < 15) {
    throw new Error(`Insufficient historical daily candles for ${symbol} on ${toDate}`);
  }
  let livePrice = current.close;
  let sessionDate = current.date;
  let starDayHigh = current.high;
  let starDayLow = current.low;
  if (!historical) {
    const { UpstoxHistoricalAdapter } = await import("./provider-foundation/upstox/upstox-historical.adapter.server");
    const quote = await new UpstoxHistoricalAdapter().fetchQuote(symbol === "NIFTY" ? "NIFTY50" : "BANKNIFTY", now.toISOString());
    if (quote.ok) {
      livePrice = quote.data.last;
      const providerTime = Date.parse(quote.data.telemetry.providerTime ?? "");
      sessionDate = Number.isFinite(providerTime)
        ? new Date(providerTime + 19800_000).toISOString().slice(0, 10)
        : current.date;
      starDayHigh = quote.data.high ?? current.high;
      starDayLow = quote.data.low ?? current.low;
      // Include the current session in live daily indicators when history has not yet published it.
      if (sessionDate === today && current.date < today && quote.data.open != null &&
          quote.data.high != null && quote.data.low != null) {
        candles.push({ date: today, time: providerTime / 1000, open: quote.data.open,
          high: starDayHigh, low: starDayLow, close: livePrice, volume: quote.data.volume ?? 0 });
      } else if (sessionDate === today && current.date === today) {
        candles[candles.length - 1] = { ...current, close: livePrice, high: starDayHigh, low: starDayLow };
      }
    }
  }
  // Today's anchor is T-1 even after close. Future dates can use today's completed EOD.
  const todayCompleted = istNow.getUTCHours() * 60 + istNow.getUTCMinutes() >= 15 * 60 + 30;
  const prev = historical ? candles.at(-2) : candles.filter((c) =>
    c.date < today || (targetDateStr > today && todayCompleted && c.date === today)).at(-1);
  if (!prev) throw new Error(`Previous trading session unavailable for ${symbol} on ${toDate}`);
  const ema13 = computeEma(candles.map((c) => c.close), 13);
  const rsi = calculateRsi(candles, { period: 14 }).points.at(-1)?.values.rsi;
  return { livePrice: round2(livePrice), prevClose: round2(prev.close), prevHigh: round2(prev.high),
    prevLow: round2(prev.low), ema13, rsi14: rsi != null ? round2(rsi) : null,
    dateStr: prev.date, sessionDate, starDayHigh, starDayLow, historical };
}

async function fetchIndiaVix(): Promise<number> {
  const url = `${YAHOO}${encodeURIComponent("^INDIAVIX")}?interval=1d&range=5d`;
  try {
    const json = parseProvider(YahooChartSchema, await fetchJson<unknown>(url), "Yahoo (^INDIAVIX)");
    const meta = json.chart.result?.[0]?.meta;
    return meta?.regularMarketPrice != null ? round2(meta.regularMarketPrice) : 13.5;
  } catch {
    return 13.5;
  }
}

export interface HTGannIntraPayload {
  asOf: string;
  targetDate: string;
  sessionDate: string;
  prevSessionDate: string;
  historical: boolean;
  customPrevClose: number | null;
  symbol: "NIFTY" | "BANKNIFTY";
  livePrice: number;
  prevClose: number;
  prevHigh: number;
  prevLow: number;
  indiaVix: number;
  dailyEma13: number | null;
  dailyRsi14: number | null;
  planets: PlanetPositionInput[];
  moonNakshatra: string;
  intraMatrix: IntradayMatrixResult;
  pillar2Starwise: Pillar2StarwiseResult;
  pillar3Retrograde: Pillar3RetrogradeResult;
  pillar4Aspects: Pillar4AspectResult;
  masterCube: MasterCubeVerdict;
}

// Proprietary EagleBABA alias
export type EagleBabaAstroPayload = HTGannIntraPayload;

export const getHTGannIntra = createServerFn({ method: "GET" })
  .validator((d: unknown): { symbol?: "NIFTY" | "BANKNIFTY"; date?: string; customPrevClose?: number } => {
    if (typeof d === "object" && d !== null) {
      const obj = d as Record<string, unknown>;
      return {
        symbol: obj.symbol === "BANKNIFTY" ? "BANKNIFTY" : "NIFTY",
        date: typeof obj.date === "string" ? obj.date : undefined,
        customPrevClose: typeof obj.customPrevClose === "number" && Number.isFinite(obj.customPrevClose) && obj.customPrevClose > 0 ? obj.customPrevClose : undefined,
      };
    }
    return { symbol: "NIFTY" };
  })
  .handler(async ({ data }): Promise<HTGannIntraPayload> => {
    const symbol = data.symbol ?? "NIFTY";
    const targetAnchor = parseIstAnchor(data.date);
    const targetDateStr = targetAnchor.toISOString().slice(0, 10);
    const today = new Date(Date.now() + 19800_000).toISOString().slice(0, 10);
    const customPrevClose = targetDateStr >= today ? data.customPrevClose : undefined;
    const cacheKey = `eaglebaba-astro:${symbol}:${targetDateStr}:${customPrevClose ?? "auto"}`;

    return cached<HTGannIntraPayload>(
      cacheKey,
      async () => {
        const { computeAstroPositions } = await import("./astro-engine.server");

        const [marketData, vix, positions] = await Promise.all([
          fetchIndexDailyData(symbol, targetDateStr),
          fetchIndiaVix(),
          Promise.resolve(computeAstroPositions(targetAnchor)),
        ]);

        const prevClose = customPrevClose != null
          ? customPrevClose
          : marketData.prevClose;

        // Map astronomical positions to Navagraha planets
        const planets: PlanetPositionInput[] = positions.planets
          .filter((p) =>
            [
              "Rahu",
              "Mars",
              "Mercury",
              "Venus",
              "Sun",
              "Ketu",
              "Moon",
              "Saturn",
              "Jupiter",
            ].includes(p.planet),
          )
          .map((p) => ({
            name: p.planet as HTGannPlanet,
            absDegree: p.absDegree,
            retro: p.retro,
            nakshatra: p.nakshatra,
            sign: p.sign,
            pada: p.pada,
          }));

        const ohlc = {
          high: marketData.prevHigh,
          low: marketData.prevLow,
          close: prevClose,
        };

        const intraMatrix = computeHtGannIntraV2Matrix({
          symbol,
          prevClose,
          planets,
          ohlc,
          indiaVix: vix,
        });

        const moonRow = positions.planets.find((p) => p.planet === "Moon");
        const moonNakshatra = moonRow?.nakshatra ?? positions.moonNakshatra;

        const pillar2Starwise = evaluatePillar2Starwise({
          moonNakshatra,
          dailyRsi14: marketData.rsi14,
          starDayHigh: marketData.starDayHigh,
          starDayLow: marketData.starDayLow,
        });

        const retroPlanets = planets.filter((p) => p.retro).map((p) => p.name);
        const pillar3Retrograde = evaluatePillar3Retrograde({
          retroPlanets,
          spotClose: marketData.livePrice,
          dailyEma13: marketData.ema13,
        });

        const pillar4Aspects = evaluatePillar4Aspects(planets);

        const masterCube = evaluateMasterCube({
          intraMatrix,
          pillar2: pillar2Starwise,
          pillar3: pillar3Retrograde,
          pillar4: pillar4Aspects,
          targetDate: targetAnchor,
        });

        return {
          asOf: new Date().toISOString(),
          targetDate: targetDateStr,
          sessionDate: marketData.sessionDate,
          prevSessionDate: marketData.dateStr,
          historical: marketData.historical,
          customPrevClose: customPrevClose ?? null,
          symbol,
          livePrice: marketData.livePrice,
          prevClose,
          prevHigh: marketData.prevHigh,
          prevLow: marketData.prevLow,
          indiaVix: vix,
          dailyEma13: marketData.ema13,
          dailyRsi14: marketData.rsi14,
          planets,
          moonNakshatra,
          intraMatrix,
          pillar2Starwise,
          pillar3Retrograde,
          pillar4Aspects,
          masterCube,
        };
      },
      { ttlMs: 30_000 },
    );
  });

// Proprietary EagleBABA alias
export const getEagleBabaAstroMatrix = getHTGannIntra;
