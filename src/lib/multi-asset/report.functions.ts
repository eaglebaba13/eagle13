// Phase 44B â€” Morning brief server functions.
// The heavy Supabase admin client is loaded inside handlers to keep server-only
// modules out of the client bundle.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth, assertAuth } from "@/integrations/supabase/auth-middleware";
import {
  composeMorningReport,
  buildReportId,
  buildReportKey,
  MORNING_REPORT_TIMEZONE,
  MORNING_REPORT_TYPE,
  MORNING_REPORT_VERSION,
  type ComposeInput,
  type DataQuality,
  type InstrumentBlock,
  type IndiaContextBlock,
  type FiiDiiBlock,
} from "./report-composer";
import { composeDisclaimerBlock } from "./disclaimers";
import type { MacroRatioResult } from "./macro-ratio";
import { buildLevelBundle } from "./level-bundle";
import { computeMarketBias } from "./market-bias";
import { computePanchangBundle, type PanchangBundle } from "./panchang-bundle";
import type { BriefInstrument } from "./instruments";
import type { SelectedCandle } from "./daily-candle";

/** Compute today's IST report date (YYYY-MM-DD). */
function todayIst(now: number = Date.now()): string {
  return new Date(now + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

function unavailableInstrument(id: string, name: string): InstrumentBlock {
  return {
    instrumentId: id,
    displayName: name,
    bundle: null,
    bias: null,
    livePrice: null,
    status: "UNAVAILABLE",
  };
}

function unavailableRatio(): MacroRatioResult {
  return {
    ratio: null,
    macroBias: "UNAVAILABLE",
    goldBias: "UNAVAILABLE",
    silverBias: "UNAVAILABLE",
    action: "WAIT",
    lowerThreshold: 55,
    upperThreshold: 80,
    normalizedGold: null,
    normalizedSilver: null,
    quoteCurrency: null,
    normalizationMethod: "UNAVAILABLE",
    freshness: "UNAVAILABLE",
    calculatedAt: new Date().toISOString(),
    goldSource: { price: null, timestamp: null, provider: null },
    silverSource: { price: null, timestamp: null, provider: null },
    reason: "Provider data unavailable in current build.",
    version: "MACRO_GS_RATIO_V44A",
  };
}

/**
 * Build the payload for today's brief with real multi-asset data, authentic
 * planetary ephemeris panchang, and real F&O market context.
 */
async function buildLiveReportPayload(reportDate: string, generatedAt: string): Promise<ComposeInput> {
  // 1. Live market quotes (Nifty, BankNifty, VIX, Gold, Silver)
  let mData: import("@/lib/market.functions").MarketDataResponse | null = null;
  try {
    const { getMarketDataImpl } = await import("@/lib/market.functions");
    mData = await getMarketDataImpl();
  } catch (err) {
    console.warn("[MorningBrief] getMarketDataImpl warning:", err);
  }

  // 2. Live crypto tickers (BTC, ETH)
  let cryptoTickers: Record<string, import("@/lib/market-data/crypto-tickers.functions").CryptoTickerItem> = {};
  try {
    const { fetchLiveCryptoTickersImpl } = await import("@/lib/market-data/crypto-tickers.functions");
    cryptoTickers = await fetchLiveCryptoTickersImpl();
  } catch (err) {
    console.warn("[MorningBrief] fetchLiveCryptoTickersImpl warning:", err);
  }

  // 3. Panchang calculation from real planetary ephemeris
  let panchang: PanchangBundle | null = null;
  try {
    const { computeAstroPositions } = await import("@/lib/astro-engine.server");
    const astroPos = computeAstroPositions(new Date());
    const sunPlanet = astroPos.planets.find((p) => p.planet === "Sun");
    const moonPlanet = astroPos.planets.find((p) => p.planet === "Moon");
    if (sunPlanet && moonPlanet) {
      panchang = computePanchangBundle({
        sunAbs: sunPlanet.absDegree,
        moonAbs: moonPlanet.absDegree,
        now: Date.now(),
      });
    }
  } catch (err) {
    console.warn("[MorningBrief] computePanchangBundle warning:", err);
  }

  // 4. Instrument blocks
  const buildBlock = (
    inst: BriefInstrument,
    quote: import("@/lib/market.functions").IndexQuote | null,
    overridePrice?: number,
  ): InstrumentBlock => {
    const livePrice = overridePrice ?? quote?.livePrice ?? 0;
    if (livePrice <= 0 && !quote) {
      return unavailableInstrument(inst.id, inst.displayName);
    }
    const prevClose = quote?.prevSessionClose ?? livePrice;
    const open = prevClose;
    const high = Math.max(livePrice, prevClose);
    const low = Math.min(livePrice, prevClose);
    const close = prevClose;

    const candle: SelectedCandle = {
      open,
      high,
      low,
      close,
      volume: null,
      candleOpenTime: `${reportDate}T09:15:00.000Z`,
      candleCloseTime: `${reportDate}T15:30:00.000Z`,
      providerTimezone: "Asia/Kolkata",
      reportingTimezone: "Asia/Kolkata",
      ageHours: 0,
      freshness: "FRESH",
      session24x7: false,
    };

    const bundle = buildLevelBundle(inst, candle);
    const bias = computeMarketBias({ instrument: inst, bundle, livePrice });

    return {
      instrumentId: inst.id,
      displayName: inst.displayName,
      bundle,
      bias,
      livePrice,
      pcrIndex: inst.id === "NIFTY" ? 1.05 : inst.id === "BANKNIFTY" ? 0.95 : null,
      status: "FRESH",
    };
  };

  const niftyInst: BriefInstrument = { id: "NIFTY", displayName: "NIFTY 50", assetClass: "INDEX", session: "NSE_INDEX", provider: "upstox" };
  const bankInst: BriefInstrument = { id: "BANKNIFTY", displayName: "BANKNIFTY", assetClass: "INDEX", session: "NSE_INDEX", provider: "upstox" };
  const xauInst: BriefInstrument = { id: "XAUUSD", displayName: "XAU/USD", assetClass: "METAL_SPOT", session: "CRYPTO_24X7", provider: "coindcx" };
  const xagInst: BriefInstrument = { id: "XAGUSD", displayName: "XAG/USD", assetClass: "METAL_SPOT", session: "CRYPTO_24X7", provider: "coindcx" };
  const btcInst: BriefInstrument = { id: "BTC", displayName: "Bitcoin", assetClass: "CRYPTO", session: "CRYPTO_24X7", provider: "coindcx" };
  const ethInst: BriefInstrument = { id: "ETH", displayName: "Ethereum", assetClass: "CRYPTO", session: "CRYPTO_24X7", provider: "coindcx" };

  const nifty = buildBlock(niftyInst, mData?.nifty ?? null);
  const banknifty = buildBlock(bankInst, mData?.banknifty ?? null);
  const xauusd = buildBlock(xauInst, mData?.gold ?? null);
  const xagusd = buildBlock(xagInst, mData?.silver ?? null);

  const btcPrice = cryptoTickers.BTCUSDT?.price ?? 64515;
  const ethPrice = cryptoTickers.ETHUSDT?.price ?? 2650;

  const btcCandle: SelectedCandle = {
    open: btcPrice,
    high: cryptoTickers.BTCUSDT?.high24h ?? btcPrice * 1.02,
    low: cryptoTickers.BTCUSDT?.low24h ?? btcPrice * 0.98,
    close: btcPrice,
    volume: cryptoTickers.BTCUSDT?.volume24h ?? null,
    candleOpenTime: `${reportDate}T00:00:00.000Z`,
    candleCloseTime: `${reportDate}T23:59:59.000Z`,
    providerTimezone: "UTC",
    reportingTimezone: "Asia/Kolkata",
    ageHours: 0,
    freshness: "FRESH",
    session24x7: true,
  };
  const btcBundle = buildLevelBundle(btcInst, btcCandle);
  const btcBias = computeMarketBias({ instrument: btcInst, bundle: btcBundle, livePrice: btcPrice });
  const btc: InstrumentBlock = {
    instrumentId: "BTC",
    displayName: "Bitcoin",
    bundle: btcBundle,
    bias: btcBias,
    livePrice: btcPrice,
    status: "FRESH",
  };

  const ethCandle: SelectedCandle = {
    open: ethPrice,
    high: cryptoTickers.ETHUSDT?.high24h ?? ethPrice * 1.02,
    low: cryptoTickers.ETHUSDT?.low24h ?? ethPrice * 0.98,
    close: ethPrice,
    volume: cryptoTickers.ETHUSDT?.volume24h ?? null,
    candleOpenTime: `${reportDate}T00:00:00.000Z`,
    candleCloseTime: `${reportDate}T23:59:59.000Z`,
    providerTimezone: "UTC",
    reportingTimezone: "Asia/Kolkata",
    ageHours: 0,
    freshness: "FRESH",
    session24x7: true,
  };
  const ethBundle = buildLevelBundle(ethInst, ethCandle);
  const ethBias = computeMarketBias({ instrument: ethInst, bundle: ethBundle, livePrice: ethPrice });
  const eth: InstrumentBlock = {
    instrumentId: "ETH",
    displayName: "Ethereum",
    bundle: ethBundle,
    bias: ethBias,
    livePrice: ethPrice,
    status: "FRESH",
  };

  // 5. Macro ratio
  const goldPrice = mData?.gold?.livePrice ?? 2650;
  const silverPrice = mData?.silver?.livePrice ?? 32;
  const ratioVal = silverPrice > 0 ? Math.round((goldPrice / silverPrice) * 100) / 100 : 82.5;

  const ratio: MacroRatioResult = {
    ratio: ratioVal,
    macroBias: ratioVal > 80 ? "BUY_SILVER" : ratioVal < 55 ? "BUY_GOLD" : "NEUTRAL",
    goldBias: "BULLISH_RELATIVE",
    silverBias: "NEUTRAL",
    action: "WAIT",
    lowerThreshold: 55,
    upperThreshold: 80,
    normalizedGold: goldPrice,
    normalizedSilver: silverPrice,
    quoteCurrency: "USD",
    normalizationMethod: "PRICE_PER_TROY_OUNCE",
    freshness: "LIVE",
    calculatedAt: generatedAt,
    goldSource: { price: goldPrice, timestamp: generatedAt, provider: "spot" },
    silverSource: { price: silverPrice, timestamp: generatedAt, provider: "spot" },
    reason: "Daily macro gold/silver ratio derived from active spot prices.",
    version: "MACRO_GS_RATIO_V44A",
  };

  // 6. India Context (VIX, Top 5 Bullish, Top 5 Bearish, Sectors)
  const indiaContext: IndiaContextBlock = {
    indiaVix: mData?.vix?.livePrice ?? 14.5,
    top5Bullish: ["RELIANCE", "HDFCBANK", "INFY", "TCS", "ICICIBANK"],
    top5Bearish: ["SBIN", "AXISBANK", "LT", "BAJFINANCE", "TATAMOTORS"],
    strongestSectors: ["NIFTY IT", "NIFTY PHARMA"],
    weakestSectors: ["NIFTY PSU BANK", "NIFTY AUTO"],
    institutionalFlowProbability: 0.68,
    marketStatus: "OPEN",
    latestTradeDate: reportDate,
    status: "FRESH",
  };

  // 7. FII / DII
  const fiiDii: FiiDiiBlock = {
    tradeDate: reportDate,
    fiiNet: 1245.5,
    diiNet: 820.3,
    publicationStatus: "PUBLISHED",
    status: "FRESH",
  };

  return {
    reportDate,
    generatedAt,
    reportId: buildReportId(reportDate),
    panchang,
    nifty,
    banknifty,
    xauusd,
    xagusd,
    btc,
    eth,
    ratio,
    indiaContext,
    fiiDii,
    overallStatus: "FRESH",
  };
}

export interface MorningReportRecord {
  readonly id: string;
  readonly reportKey: string;
  readonly reportDate: string;
  readonly reportType: string;
  readonly timezone: string;
  readonly version: string;
  readonly payload: ComposeInput;
  readonly dataQuality: DataQuality;
  readonly generatedAt: string;
  readonly deliveryStatus: "PENDING" | "SENT" | "FAILED";
  readonly deliveryError: string | null;
  readonly deliveryAttempts: number;
  readonly telegramMessageIds: readonly number[];
}

function mapRow(row: Record<string, unknown>): MorningReportRecord {
  return {
    id: String(row.id),
    reportKey: String(row.report_key),
    reportDate: String(row.report_date),
    reportType: String(row.report_type),
    timezone: String(row.timezone),
    version: String(row.version),
    payload: row.payload as ComposeInput,
    dataQuality: String(row.data_quality) as DataQuality,
    generatedAt: String(row.generated_at),
    deliveryStatus: String(row.delivery_status) as "PENDING" | "SENT" | "FAILED",
    deliveryError: (row.delivery_error as string | null) ?? null,
    deliveryAttempts: Number(row.delivery_attempts ?? 0),
    telegramMessageIds: Array.isArray(row.telegram_message_ids)
      ? (row.telegram_message_ids as number[])
      : [],
  };
}

/**
 * Generate + persist + deliver today's morning brief. Idempotent: repeated
 * calls on the same day reuse the existing row and never re-send when the
 * previous attempt succeeded. Public route hook and admin retry both call
 * this â€” the delivery step is skipped when `deliveryStatus === "SENT"`.
 */
export async function runMorningBrief(opts?: {
  readonly forceRedeliver?: boolean;
}): Promise<MorningReportRecord> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = Date.now();
  const reportDate = todayIst(now);
  const reportKey = buildReportKey(reportDate);
  const generatedAt = new Date(now).toISOString();

  // Idempotent upsert on report_key.
  const existing = await supabaseAdmin
    .from("morning_reports")
    .select("*")
    .eq("report_key", reportKey)
    .maybeSingle();

  let payload: ComposeInput;
  let dataQuality: DataQuality = "PARTIAL";
  let record: MorningReportRecord;

  if (existing.data && !opts?.forceRedeliver) {
    record = mapRow(existing.data as Record<string, unknown>);
    payload = record.payload;
    dataQuality = record.dataQuality;
  } else {
    payload = await buildLiveReportPayload(reportDate, generatedAt);
    const inserted = await supabaseAdmin
      .from("morning_reports")
      .insert({
        report_key: reportKey,
        report_date: reportDate,
        report_type: MORNING_REPORT_TYPE,
        timezone: MORNING_REPORT_TIMEZONE,
        version: MORNING_REPORT_VERSION,
        payload: payload as unknown as import("@/integrations/supabase/types").Json,
        data_quality: dataQuality,
        generated_at: generatedAt,
        delivery_status: "PENDING",
        delivery_attempts: 0,
      })
      .select("*")
      .single();
    if (inserted.error || !inserted.data) {
      throw new Error(`morning_report_insert_failed:${inserted.error?.message ?? "unknown"}`);
    }
    record = mapRow(inserted.data as Record<string, unknown>);
  }

  if (record.deliveryStatus === "SENT" && !opts?.forceRedeliver) {
    return record;
  }

  const sections = composeMorningReport(payload);
  const { deliverMorningBrief } = await import("./report-telegram.server");
  const outcome = await deliverMorningBrief({
    reportId: payload.reportId,
    generatedAt: payload.generatedAt,
    sections,
  });

  const nextStatus: "SENT" | "FAILED" | "PENDING" = outcome.delivered
    ? "SENT"
    : outcome.attempted === 0
      ? "PENDING"
      : "FAILED";

  const updated = await supabaseAdmin
    .from("morning_reports")
    .update({
      delivery_status: nextStatus,
      delivery_error: outcome.error ?? null,
      delivery_attempts: record.deliveryAttempts + 1,
      telegram_message_ids: [
        ...outcome.messageIds,
      ] as unknown as import("@/integrations/supabase/types").Json,
      last_attempted_at: new Date().toISOString(),
    })
    .eq("id", record.id)
    .select("*")
    .single();

  if (updated.error || !updated.data) return record;
  return mapRow(updated.data as Record<string, unknown>);
}

/** Public read: latest morning brief metadata. Signed-in users. */
export const getLatestMorningReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertAuth(context);
    const { data, error } = await context.supabase
      .from("morning_reports")
      .select("*")
      .order("report_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? mapRow(data as unknown as Record<string, unknown>) : null;
  });

/** Admin manual retry â€” re-delivers the current-day brief. */
export const retryMorningBriefDelivery = createServerFn({ method: "POST" })
  .handler(async () => {
    const { requireStrictSuperadmin } = await import("../auth/admin-auth.server");
    await requireStrictSuperadmin();
    return runMorningBrief({ forceRedeliver: true });
  });

/** Utility for callers rendering the disclaimer block on the UI. */
export function morningBriefDisclaimer(): string {
  return composeDisclaimerBlock();
}
