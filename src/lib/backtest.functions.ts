// Historical Backtest Engine — server function.
//
// This module reuses the production Astro engine (`computeAstroPositions`),
// level formulas (`computeCycles`, `computeAstroLevels`) and the shared
// signal engine (`buildLevelBoard`, `computeSignal`) — it never redefines any
// business logic. Only the replay loop and outcome measurement live here.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchJson } from "./http";
import { YahooChartSchema, parseProvider } from "./providers";
import {
  computeCycles,
  computeAstroLevels,
  buildLevelBoard,
  computeSignal,
  type PlanetRow,
} from "./astro-levels";
import { cached } from "./server-cache";
import {
  DEFAULT_ASTRO_FORMULA_VERSION,
  ASTRO_FORMULA_VERSIONS,
  astroCacheKey,
  type AstroFormulaVersion,
} from "./engine-version";
import { warnLegacyHashQuirkIfApplicable } from "./backtest/legacy-diagnostics";
import {
  BACKTEST_ENGINE_VERSION,
  BACKTEST_FORMULA_VERSION,
  ZERO_COSTS,
  assertCausal,
  buildStats,
  computeRunId,
  expectedTradingSessions,
  hashConfig,
  pickTargetStop,
  resolveOutcome,
  validateCandle,
  type CostModel,
  type ExecutionPolicy,
  type InvalidSetupPolicy,
  type StatBundle,
} from "./backtest-engine";

const YAHOO = "https://query1.finance.yahoo.com/v8/finance/chart/";

export const BACKTEST_SYMBOLS = {
  NIFTY50:   { yahoo: "^NSEI",     label: "NIFTY 50" },
  BANKNIFTY: { yahoo: "^NSEBANK",  label: "BANK NIFTY" },
  GOLD:      { yahoo: "GC=F",      label: "GOLD" },
  SILVER:    { yahoo: "SI=F",      label: "SILVER" },
  BTC:       { yahoo: "BTC-USD",   label: "BITCOIN" },
} as const;
export type BacktestSymbol = keyof typeof BACKTEST_SYMBOLS;

export type BacktestTrade = {
  date: string;              // yyyy-mm-dd (IST)
  time: string;              // "09:15"
  symbol: BacktestSymbol;
  signal: "BUY" | "SELL" | "WAIT";
  strength: string;
  confidence: number;
  entry: number | null;
  exit: number | null;
  high: number | null;
  low: number | null;
  target: number | null;
  stop: number | null;
  targetHit: boolean;
  stopHit: boolean;
  result: "WIN" | "LOSS" | "FLAT" | "SKIP" | "AMBIGUOUS" | "INVALID_SETUP";
  pnl: number;
  pnlPct: number;
  moonSign: string;
  moonNakshatra: string;
  retroCount: number;
  nearest: string | null;
  dayOfWeek: string;
  month: string;             // yyyy-mm
  // Optional integrity metadata — additive, defaults keep legacy consumers happy.
  ambiguous?: boolean;
  fabricatedLevels?: boolean;
  grossPnl?: number;
  netPnl?: number;
  costs?: number;
  astroTs?: string;
  entryTs?: string;
  exitTs?: string;
  dataAvailableTs?: string;
};

export type BacktestMonthly = {
  month: string;
  trades: number;
  wins: number;
  losses: number;
  pnl: number;
  accuracy: number;
};

export type BacktestInsight = { key: string; trades: number; wins: number; winRate: number; pnl: number };

export type BacktestSummary = {
  totalSignals: number;
  buy: number;
  sell: number;
  wait: number;
  taken: number;
  wins: number;
  losses: number;
  flats: number;
  winRate: number;
  lossRate: number;
  accuracy: number;
  avgProfit: number;
  avgLoss: number;
  profitFactor: number;
  netProfit: number;
  maxDrawdown: number;
  maxConsecWins: number;
  maxConsecLosses: number;
  avgHoldingDays: number;
  bestMonth: { month: string; pnl: number } | null;
  worstMonth: { month: string; pnl: number } | null;
};

export type BacktestResult = {
  symbol: BacktestSymbol;
  yahooSymbol: string;
  label: string;
  from: string;
  to: string;
  candles: number;
  trades: BacktestTrade[];
  summary: BacktestSummary;
  monthly: BacktestMonthly[];
  insights: {
    bestNakshatra: BacktestInsight | null;
    worstNakshatra: BacktestInsight | null;
    bestMoonSign: BacktestInsight | null;
    worstMoonSign: BacktestInsight | null;
    bestRetroCombo: BacktestInsight | null;
    worstRetroCombo: BacktestInsight | null;
    mostSuccessfulSignal: BacktestInsight | null;
    mostFailedSignal: BacktestInsight | null;
  };
  equityCurve: { date: string; cumulative: number }[];
  generatedAt: string;
  // ── Integrity, reproducibility & disclosure ─────────────────────────────
  runId: string;
  engineVersion: string;
  formulaVersion: string;
  astroFormulaVersion: AstroFormulaVersion;
  configHash: string;
  executionMeta: {
    policy: ExecutionPolicy;
    invalidSetupPolicy: InvalidSetupPolicy;
    costs: CostModel;
    astroAnchor: string;      // "09:00 IST"
    entryTime: string;        // "09:15 IST"
    exitAssumption: string;   // "target / stop within daily OHLC; else close"
    dataSource: string;       // e.g. "Yahoo Finance (daily)"
    timezone: string;         // "Asia/Kolkata" | "UTC"
    candleTimeframe: string;  // "1d"
  };
  dataQuality: {
    expectedSessions: number;
    loadedSessions: number;
    missingSessions: number;
    invalidSessions: number;
    coveragePct: number;
    dataSource: string;
    adjusted: "adjusted" | "unadjusted" | "unknown";
    /** Non-fatal provider failure captured while loading candles. */
    providerError?: {
      provider: string;
      host: string;
      httpStatus: number | null;
      stage: "fetch" | "parse" | "unknown";
      message: string;
      observedAt: string;
    } | null;
  };
  stats: StatBundle;
  benchmark: {
    buyAndHoldPnl: number;
    buyAndHoldPct: number;
    strategyPct: number;
    excessPct: number;
    activeDays: number;
  } | null;
  ambiguousCount: number;
  invalidSetupCount: number;
  disclaimers: string[];
};

// Extended input — every new option is optional and defaults preserve the
// existing byte-for-byte output (conservative + fabricate + zero costs).
const CostSchema = z.object({
  slippagePct: z.number().min(0).max(5).default(0),
  brokerageFlat: z.number().min(0).default(0),
  brokeragePct: z.number().min(0).max(5).default(0),
  taxesPct: z.number().min(0).max(5).default(0),
});
const InputSchema = z.object({
  symbol: z.enum(["NIFTY50", "BANKNIFTY", "GOLD", "SILVER", "BTC"]),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  policy: z.enum(["conservative", "optimistic", "exclude_ambiguous"]).default("conservative"),
  invalidSetupPolicy: z.enum(["fabricate", "strict"]).default("fabricate"),
  costs: CostSchema.default({ slippagePct: 0, brokerageFlat: 0, brokeragePct: 0, taxesPct: 0 }),
  // Phase 21.3d-parity-β2a · Optional formula switch. Default preserves
  // Sign-Degree public output byte-for-byte (cache key, Run ID, envelope).
  // When omitted, `astroCacheKey` and `computeRunId` receive the same
  // DEFAULT_ASTRO_FORMULA_VERSION they used before this parameter existed.
  astroFormulaVersion: z
    .enum([
      ASTRO_FORMULA_VERSIONS.GANN_NIFTY_ASTRO_V1_1,
      ASTRO_FORMULA_VERSIONS.LEGACY_EAGLEBABA_CASCADE_V1,
    ])
    .optional(),
});
type BacktestInput = z.infer<typeof InputSchema>;

const BTC_TIMEZONE = "UTC";
const IST_TIMEZONE = "Asia/Kolkata";

function istDateStr(unixSeconds: number): string {
  return new Date((unixSeconds + 19800) * 1000).toISOString().slice(0, 10);
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Candle = { date: string; open: number; high: number; low: number; close: number; ts: number };

async function fetchCandles(yahooSymbol: string, fromIso: string, toIso: string): Promise<Candle[]> {
  const p1 = Math.floor(new Date(fromIso + "T00:00:00Z").getTime() / 1000);
  const p2 = Math.floor(new Date(toIso + "T23:59:59Z").getTime() / 1000);
  const url = `${YAHOO}${encodeURIComponent(yahooSymbol)}?interval=1d&period1=${p1}&period2=${p2}`;
  const json = parseProvider(YahooChartSchema, await fetchJson<unknown>(url), `Yahoo (${yahooSymbol})`);
  const result = json.chart.result?.[0];
  if (!result) return [];
  const ts = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};
  const out: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
    if (o == null || h == null || l == null || c == null) continue;
    out.push({ date: istDateStr(ts[i]), open: o, high: h, low: l, close: c, ts: ts[i] });
  }
  return out;
}

function round2(n: number): number { return Math.round(n * 100) / 100; }

function isoAt(dateStr: string, hh: number, mm: number, tzOffsetMin: number): string {
  // Build an ISO instant for `dateStr hh:mm` in the given fixed timezone offset.
  const [y, m, d] = dateStr.split("-").map(Number);
  const utcMs = Date.UTC(y, m - 1, d, hh, mm, 0) - tzOffsetMin * 60_000;
  return new Date(utcMs).toISOString();
}

/** Return anchor timestamp of 09:00 IST for a given yyyy-mm-dd string. */
function nineAmIst(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 3, 30, 0));
}

/** Evaluate a single day using cycles from prior close + astro at 09:00 IST. */
function replayDay(
  today: Candle,
  prev: Candle,
  positions: Awaited<ReturnType<typeof import("./astro-engine.server").computeAstroPositions>>,
  symbol: BacktestSymbol,
  policy: ExecutionPolicy,
  invalidSetupPolicy: InvalidSetupPolicy,
  costs: CostModel,
): BacktestTrade {
  const cycles = computeCycles(prev.close);
  const planets: PlanetRow[] = positions.planets.map((p) => ({
    ...p,
    ...computeAstroLevels(cycles, p.degree),
  }));
  const entry = today.open;
  const board = buildLevelBoard(planets, entry);
  const sig = computeSignal({
    price: entry,
    board,
    moonNakshatra: positions.moonNakshatra,
    retroCount: positions.retroCount,
    totalPlanets: planets.length,
    bullRetroCount: positions.bullRetroCount,
    bearRetroCount: positions.bearRetroCount,
  });

  // Pure target/stop selection reused everywhere: nearest opposing level in
  // the direction of the trade. When missing, `invalidSetupPolicy` decides.
  const picked = pickTargetStop(board.map((b) => ({ value: b.value, isResistance: b.isResistance })), entry, sig.signal);
  let target = picked.target;
  let stop = picked.stop;
  let fabricatedLevels = false;
  if (sig.signal !== "WAIT" && (target == null || stop == null) && invalidSetupPolicy === "fabricate") {
    fabricatedLevels = true;
    if (sig.signal === "BUY") {
      target = target ?? round2(entry * 1.005);
      stop = stop ?? round2(entry * 0.995);
    } else {
      target = target ?? round2(entry * 0.995);
      stop = stop ?? round2(entry * 1.005);
    }
  }

  const dow = DAYS[new Date(today.date + "T00:00:00Z").getUTCDay()];
  const month = today.date.slice(0, 7);
  const nearest = sig.nearest ? `${sig.nearest.planet} ${sig.nearest.kind}` : null;

  const isBtc = symbol === "BTC";
  const tzOffsetMin = isBtc ? 0 : 330;                 // 09:00 IST = UTC+5:30
  const astroTs = isoAt(today.date, isBtc ? 0 : 9, 0, tzOffsetMin);
  const entryTs = isoAt(today.date, isBtc ? 0 : 9, isBtc ? 0 : 15, tzOffsetMin);
  const exitTs = isoAt(today.date, isBtc ? 23 : 15, isBtc ? 59 : 30, tzOffsetMin);
  const dataAvailableTs = isoAt(prev.date, 23, 59, tzOffsetMin); // prior close

  const base: BacktestTrade = {
    date: today.date,
    time: "09:15",
    symbol,
    signal: sig.signal,
    strength: sig.strength,
    confidence: sig.confidence,
    entry: round2(entry),
    exit: round2(today.close),
    high: round2(today.high),
    low: round2(today.low),
    target: target == null ? null : round2(target),
    stop: stop == null ? null : round2(stop),
    targetHit: false,
    stopHit: false,
    result: "SKIP",
    pnl: 0,
    pnlPct: 0,
    moonSign: positions.moonSign,
    moonNakshatra: positions.moonNakshatra,
    retroCount: positions.retroCount,
    nearest,
    dayOfWeek: dow,
    month,
    ambiguous: false,
    fabricatedLevels,
    grossPnl: 0,
    netPnl: 0,
    costs: 0,
    astroTs,
    entryTs,
    exitTs,
    dataAvailableTs,
  };

  if (sig.signal === "WAIT") return base;
  if (target == null || stop == null) return { ...base, result: "INVALID_SETUP" };

  const outcome = resolveOutcome({
    signal: sig.signal,
    entry,
    target,
    stop,
    high: today.high,
    low: today.low,
    close: today.close,
    policy,
    costs,
  });

  // Defensive causality check (data available at prev close < signal at 09:00 IST < entry 09:15 IST < exit 15:30 IST).
  const cz = assertCausal({
    signalTs: Date.parse(astroTs),
    entryTs: Date.parse(entryTs),
    exitTs: Date.parse(exitTs),
    dataAvailableTs: Date.parse(dataAvailableTs),
  });
  if (!cz.ok) {
    // Should never trigger — engine only reads prev-close + 09:00 astro state.
    // Surfacing as SKIP keeps aggregate math safe.
    return { ...base, result: "SKIP" };
  }

  return {
    ...base,
    exit: outcome.exit,
    target: round2(target),
    stop: round2(stop),
    targetHit: outcome.targetHit,
    stopHit: outcome.stopHit,
    ambiguous: outcome.ambiguous,
    result: outcome.result,
    // Legacy .pnl mirrors gross when costs are zero → default output stays byte-identical.
    pnl: outcome.netPnl,
    pnlPct: outcome.pnlPct,
    grossPnl: outcome.grossPnl,
    netPnl: outcome.netPnl,
    costs: outcome.costs,
  };
}

function aggregate(trades: BacktestTrade[]): { summary: BacktestSummary; monthly: BacktestMonthly[]; equity: { date: string; cumulative: number }[] } {
  let buy = 0, sell = 0, wait = 0, wins = 0, losses = 0, flats = 0;
  let sumProfit = 0, sumLoss = 0, taken = 0;
  const monthlyMap = new Map<string, BacktestMonthly>();
  const equity: { date: string; cumulative: number }[] = [];
  let cum = 0;
  let peak = 0;
  let maxDD = 0;
  let consecW = 0, consecL = 0, maxConsecW = 0, maxConsecL = 0;

  for (const t of trades) {
    if (t.signal === "BUY") buy++;
    else if (t.signal === "SELL") sell++;
    else wait++;

    if (t.result === "WIN" || t.result === "LOSS" || t.result === "FLAT") taken++;
    if (t.result === "WIN") { wins++; sumProfit += t.pnl; consecW++; consecL = 0; if (consecW > maxConsecW) maxConsecW = consecW; }
    else if (t.result === "LOSS") { losses++; sumLoss += Math.abs(t.pnl); consecL++; consecW = 0; if (consecL > maxConsecL) maxConsecL = consecL; }
    else if (t.result === "FLAT") { flats++; consecW = 0; consecL = 0; }

    cum = Math.round((cum + t.pnl) * 100) / 100;
    if (cum > peak) peak = cum;
    const dd = peak - cum;
    if (dd > maxDD) maxDD = dd;
    equity.push({ date: t.date, cumulative: cum });

    let bucket = monthlyMap.get(t.month);
    if (!bucket) { bucket = { month: t.month, trades: 0, wins: 0, losses: 0, pnl: 0, accuracy: 0 }; monthlyMap.set(t.month, bucket); }
    if (t.result !== "SKIP") {
      bucket.trades++;
      bucket.pnl = Math.round((bucket.pnl + t.pnl) * 100) / 100;
      if (t.result === "WIN") bucket.wins++;
      else if (t.result === "LOSS") bucket.losses++;
    }
  }

  for (const m of monthlyMap.values()) {
    const decided = m.wins + m.losses;
    m.accuracy = decided > 0 ? Math.round((m.wins / decided) * 1000) / 10 : 0;
  }

  const monthly = Array.from(monthlyMap.values()).sort((a, b) => a.month.localeCompare(b.month));
  const decided = wins + losses;
  const winRate = decided > 0 ? Math.round((wins / decided) * 1000) / 10 : 0;
  const lossRate = decided > 0 ? Math.round((losses / decided) * 1000) / 10 : 0;
  const accuracy = taken > 0 ? Math.round((wins / taken) * 1000) / 10 : 0;
  const avgProfit = wins > 0 ? Math.round((sumProfit / wins) * 100) / 100 : 0;
  const avgLoss = losses > 0 ? Math.round((sumLoss / losses) * 100) / 100 : 0;
  const profitFactor = sumLoss > 0 ? Math.round((sumProfit / sumLoss) * 100) / 100 : sumProfit > 0 ? Infinity : 0;

  let bestMonth: { month: string; pnl: number } | null = null;
  let worstMonth: { month: string; pnl: number } | null = null;
  for (const m of monthly) {
    if (!bestMonth || m.pnl > bestMonth.pnl) bestMonth = { month: m.month, pnl: m.pnl };
    if (!worstMonth || m.pnl < worstMonth.pnl) worstMonth = { month: m.month, pnl: m.pnl };
  }

  const summary: BacktestSummary = {
    totalSignals: trades.length,
    buy, sell, wait,
    taken,
    wins, losses, flats,
    winRate, lossRate, accuracy,
    avgProfit, avgLoss,
    profitFactor: profitFactor === Infinity ? 999 : profitFactor,
    netProfit: Math.round(cum * 100) / 100,
    maxDrawdown: Math.round(maxDD * 100) / 100,
    maxConsecWins: maxConsecW,
    maxConsecLosses: maxConsecL,
    avgHoldingDays: 1,
    bestMonth, worstMonth,
  };
  return { summary, monthly, equity };
}

function groupInsights<T extends string>(trades: BacktestTrade[], keyOf: (t: BacktestTrade) => T | null): Map<T, BacktestInsight> {
  const m = new Map<T, BacktestInsight>();
  for (const t of trades) {
    if (t.result === "SKIP" || t.result === "FLAT") continue;
    const k = keyOf(t);
    if (!k) continue;
    let b = m.get(k);
    if (!b) { b = { key: k, trades: 0, wins: 0, winRate: 0, pnl: 0 }; m.set(k, b); }
    b.trades++;
    if (t.result === "WIN") b.wins++;
    b.pnl = Math.round((b.pnl + t.pnl) * 100) / 100;
  }
  for (const b of m.values()) b.winRate = b.trades > 0 ? Math.round((b.wins / b.trades) * 1000) / 10 : 0;
  return m;
}

function pickBestWorst(map: Map<string, BacktestInsight>, minTrades = 3): { best: BacktestInsight | null; worst: BacktestInsight | null } {
  const arr = Array.from(map.values()).filter((v) => v.trades >= minTrades);
  if (arr.length === 0) return { best: null, worst: null };
  const best = [...arr].sort((a, b) => b.winRate - a.winRate || b.pnl - a.pnl)[0];
  const worst = [...arr].sort((a, b) => a.winRate - b.winRate || a.pnl - b.pnl)[0];
  return { best, worst };
}

export const runBacktest = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }: { data: BacktestInput }): Promise<BacktestResult> =>
  {
    // Resolve formula selection. When omitted, the cache key, Run ID, and
    // envelope are byte-identical to the pre-β2a Sign-Degree output because
    // `astroCacheKey` / `computeRunId` default to DEFAULT_ASTRO_FORMULA_VERSION.
    const astroFormulaVersion: AstroFormulaVersion =
      data.astroFormulaVersion ?? DEFAULT_ASTRO_FORMULA_VERSION;
    warnLegacyHashQuirkIfApplicable(data.costs);
    return cached<BacktestResult>(
      astroCacheKey(
        `backtest:${data.symbol}:${data.from}:${data.to}:${data.policy}:${data.invalidSetupPolicy}:${hashConfig(data.costs)}`,
        astroFormulaVersion,
      ),
      async () => {
        const map = BACKTEST_SYMBOLS[data.symbol];
        const isBtc = data.symbol === "BTC";
        const timezone = isBtc ? BTC_TIMEZONE : IST_TIMEZONE;
        const executionMeta: BacktestResult["executionMeta"] = {
          policy: data.policy,
          invalidSetupPolicy: data.invalidSetupPolicy,
          costs: data.costs,
          astroAnchor: isBtc ? "00:00 UTC" : "09:00 IST",
          entryTime: isBtc ? "00:00 UTC" : "09:15 IST",
          exitAssumption: "target / stop within daily OHLC; else session close",
          dataSource: "Yahoo Finance (daily, unadjusted OHLC)",
          timezone,
          candleTimeframe: "1d",
        };
        const runId = computeRunId({
          symbol: data.symbol, from: data.from, to: data.to,
          policy: data.policy, invalidSetupPolicy: data.invalidSetupPolicy,
          costs: data.costs, dataSource: executionMeta.dataSource, timezone,
          astroFormulaVersion,
        });
        const configHash = hashConfig({
          symbol: data.symbol, from: data.from, to: data.to,
          policy: data.policy, invalidSetupPolicy: data.invalidSetupPolicy,
          costs: data.costs,
        });
        const disclaimers = [
          "Historical results are simulated and depend on candle resolution, execution assumptions, data quality, slippage, and costs.",
          "Daily OHLC data cannot determine intraday event order — the both-touched case is resolved per the selected execution policy.",
          "Backtests are informational and do not guarantee future performance.",
        ];
        // Pull one extra day before `from` so day-1 has a prev-close reference.
        const fromExpanded = new Date(new Date(data.from + "T00:00:00Z").getTime() - 5 * 86400_000)
          .toISOString().slice(0, 10);
        let rawCandles: Candle[] = [];
        let providerError: NonNullable<BacktestResult["dataQuality"]["providerError"]> | null = null;
        try {
          rawCandles = await fetchCandles(map.yahoo, fromExpanded, data.to);
        } catch (err) {
          const raw = err instanceof Error ? err.message : String(err);
          // Extract HTTP status when http.ts formatted it as "Data source error <status> for <host>".
          const statusMatch = /Data source error\s+(\d{3})/i.exec(raw);
          const hostMatch = /for\s+([^\s]+)/i.exec(raw);
          providerError = {
            provider: "Yahoo Finance",
            host: hostMatch?.[1] ?? "query1.finance.yahoo.com",
            httpStatus: statusMatch ? Number(statusMatch[1]) : null,
            stage: /invalid json/i.test(raw) ? "parse" : "fetch",
            message: raw.slice(0, 240),
            observedAt: new Date().toISOString(),
          };
          // Fall through to the empty-result branch below with typed diagnostics.
          rawCandles = [];
        }
        let invalidSessions = 0;
        const candles = rawCandles.filter((c) => {
          const v = validateCandle(c);
          if (!v.valid) { invalidSessions++; return false; }
          return true;
        });
        const loadedInRange = candles.filter((c) => c.date >= data.from && c.date <= data.to).length;
        const expected = expectedTradingSessions(data.from, data.to, isBtc);
        const dataQuality: BacktestResult["dataQuality"] = {
          expectedSessions: expected,
          loadedSessions: loadedInRange,
          missingSessions: Math.max(0, expected - loadedInRange),
          invalidSessions,
          coveragePct: expected > 0 ? Math.round((loadedInRange / expected) * 1000) / 10 : 0,
          dataSource: executionMeta.dataSource,
          adjusted: "unadjusted",
          providerError,
        };

        if (candles.length < 2) {
          const empty = aggregate([]);
          const degradedDisclaimers = providerError
            ? [
                ...disclaimers,
                `Historical data source unavailable (${providerError.provider}${providerError.httpStatus ? ` · HTTP ${providerError.httpStatus}` : ""}) — no candles were loaded for this range.`,
              ]
            : disclaimers;
          return {
            symbol: data.symbol, yahooSymbol: map.yahoo, label: map.label,
            from: data.from, to: data.to, candles: candles.length,
            trades: [], summary: empty.summary, monthly: empty.monthly,
            insights: {
              bestNakshatra: null, worstNakshatra: null,
              bestMoonSign: null, worstMoonSign: null,
              bestRetroCombo: null, worstRetroCombo: null,
              mostSuccessfulSignal: null, mostFailedSignal: null,
            },
            equityCurve: [], generatedAt: new Date().toISOString(),
            runId, engineVersion: BACKTEST_ENGINE_VERSION,
            formulaVersion: BACKTEST_FORMULA_VERSION, configHash,
            astroFormulaVersion,
            executionMeta, dataQuality,
            stats: buildStats([], 0, 0, 0),
            benchmark: null,
            ambiguousCount: 0,
            invalidSetupCount: 0,
            disclaimers: degradedDisclaimers,
          };
        }

        const { computeAstroPositions } = await import("./astro-engine.server");
        const trades: BacktestTrade[] = [];
        for (let i = 1; i < candles.length; i++) {
          const today = candles[i];
          if (today.date < data.from || today.date > data.to) continue;
          const prev = candles[i - 1];
          const positions = computeAstroPositions(nineAmIst(today.date));
          trades.push(replayDay(today, prev, positions, data.symbol, data.policy, data.invalidSetupPolicy, data.costs));
        }

        const { summary, monthly, equity } = aggregate(trades);
        const nak = pickBestWorst(groupInsights(trades, (t) => t.moonNakshatra));
        const sign = pickBestWorst(groupInsights(trades, (t) => t.moonSign));
        const retro = pickBestWorst(groupInsights(trades, (t) => `${t.retroCount} retro`));
        const sigMap = groupInsights(trades, (t) => t.signal === "WAIT" ? null : t.signal);
        const sigSorted = Array.from(sigMap.values()).sort((a, b) => b.winRate - a.winRate);

        const ambiguousCount = trades.filter((t) => t.ambiguous).length;
        const invalidSetupCount = trades.filter((t) => t.result === "INVALID_SETUP").length;
        const decidedForStats = trades
          .filter((t) => t.result === "WIN" || t.result === "LOSS" || t.result === "FLAT")
          .map((t) => ({ result: t.result, pnl: t.pnl, pnlPct: t.pnlPct }));
        const stats = buildStats(decidedForStats, trades.length, summary.netProfit, summary.maxDrawdown);

        // Benchmark = buy & hold from first to last in-range candle.
        const inRange = candles.filter((c) => c.date >= data.from && c.date <= data.to);
        const first = inRange[0];
        const last = inRange[inRange.length - 1];
        const benchmark = first && last
          ? {
              buyAndHoldPnl: Math.round((last.close - first.open) * 100) / 100,
              buyAndHoldPct: Math.round(((last.close - first.open) / first.open) * 10000) / 100,
              strategyPct: first.open > 0 ? Math.round((summary.netProfit / first.open) * 10000) / 100 : 0,
              excessPct: 0,
              activeDays: decidedForStats.length,
            }
          : null;
        if (benchmark) benchmark.excessPct = Math.round((benchmark.strategyPct - benchmark.buyAndHoldPct) * 100) / 100;

        return {
          symbol: data.symbol, yahooSymbol: map.yahoo, label: map.label,
          from: data.from, to: data.to, candles: candles.length,
          trades, summary, monthly,
          insights: {
            bestNakshatra: nak.best, worstNakshatra: nak.worst,
            bestMoonSign: sign.best, worstMoonSign: sign.worst,
            bestRetroCombo: retro.best, worstRetroCombo: retro.worst,
            mostSuccessfulSignal: sigSorted[0] ?? null,
            mostFailedSignal: sigSorted[sigSorted.length - 1] ?? null,
          },
          equityCurve: equity,
          generatedAt: new Date().toISOString(),
          runId, engineVersion: BACKTEST_ENGINE_VERSION,
          formulaVersion: BACKTEST_FORMULA_VERSION, configHash,
          astroFormulaVersion,
          executionMeta, dataQuality,
          stats, benchmark,
          ambiguousCount, invalidSetupCount,
          disclaimers,
        };
      },
      { ttlMs: 6 * 60 * 60_000, swrMs: 18 * 60 * 60_000 },
    );
  },
  );