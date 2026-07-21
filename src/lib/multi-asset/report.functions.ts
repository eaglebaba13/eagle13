// Phase 44B — Morning brief server functions.
// The heavy Supabase admin client is loaded inside handlers to keep server-only
// modules out of the client bundle.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
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
import { deliverMorningBrief } from "./report-telegram.server";
import { composeDisclaimerBlock } from "./disclaimers";
import type { MacroRatioResult } from "./macro-ratio";

/** Compute today's IST report date (YYYY-MM-DD). */
function todayIst(now: number = Date.now()): string {
  return new Date(now + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

function unavailableInstrument(id: string, name: string): InstrumentBlock {
  return { instrumentId: id, displayName: name, bundle: null, bias: null, livePrice: null, status: "UNAVAILABLE" };
}

function unavailableRatio(): MacroRatioResult {
  return {
    ratio: null, macroBias: "UNAVAILABLE",
    goldBias: "UNAVAILABLE", silverBias: "UNAVAILABLE",
    action: "WAIT", lowerThreshold: 55, upperThreshold: 80,
    normalizedGold: null, normalizedSilver: null, quoteCurrency: null,
    normalizationMethod: "UNAVAILABLE", freshness: "UNAVAILABLE",
    calculatedAt: new Date().toISOString(),
    goldSource: { price: null, timestamp: null, provider: null },
    silverSource: { price: null, timestamp: null, provider: null },
    reason: "Provider data unavailable in current build.",
    version: "MACRO_GS_RATIO_V44A",
  };
}

/**
 * Build the payload for today's brief. This is intentionally conservative:
 * every block is UNAVAILABLE unless a validated provider adapter is wired.
 * Later phases attach live provider selectors — the payload shape and
 * idempotency contract stay stable.
 */
function buildEmptyPayload(reportDate: string, generatedAt: string): ComposeInput {
  const india: IndiaContextBlock = {
    indiaVix: null, top5Bullish: [], top5Bearish: [],
    strongestSectors: [], weakestSectors: [],
    institutionalFlowProbability: null,
    marketStatus: "UNAVAILABLE", latestTradeDate: null, status: "UNAVAILABLE",
  };
  const fii: FiiDiiBlock = { tradeDate: null, fiiNet: null, diiNet: null, publicationStatus: "UNAVAILABLE", status: "UNAVAILABLE" };
  return {
    reportDate, generatedAt,
    reportId: buildReportId(reportDate),
    panchang: null,
    nifty: unavailableInstrument("NIFTY", "NIFTY 50"),
    banknifty: unavailableInstrument("BANKNIFTY", "BANKNIFTY"),
    xauusd: unavailableInstrument("XAUUSD", "XAU/USD"),
    xagusd: unavailableInstrument("XAGUSD", "XAG/USD"),
    btc: unavailableInstrument("BTC", "Bitcoin"),
    eth: unavailableInstrument("ETH", "Ethereum"),
    ratio: unavailableRatio(),
    indiaContext: india, fiiDii: fii, overallStatus: "PARTIAL",
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
 * this — the delivery step is skipped when `deliveryStatus === "SENT"`.
 */
export async function runMorningBrief(opts?: { readonly forceRedeliver?: boolean }): Promise<MorningReportRecord> {
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

  if (existing.data) {
    record = mapRow(existing.data as Record<string, unknown>);
    payload = record.payload;
    dataQuality = record.dataQuality;
  } else {
    payload = buildEmptyPayload(reportDate, generatedAt);
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
  const outcome = await deliverMorningBrief({
    reportId: payload.reportId, generatedAt: payload.generatedAt, sections,
  });

  const nextStatus: "SENT" | "FAILED" | "PENDING" =
    outcome.delivered ? "SENT" : outcome.attempted === 0 ? "PENDING" : "FAILED";

  const updated = await supabaseAdmin
    .from("morning_reports")
    .update({
      delivery_status: nextStatus,
      delivery_error: outcome.error ?? null,
      delivery_attempts: record.deliveryAttempts + 1,
      telegram_message_ids: [...outcome.messageIds] as unknown as import("@/integrations/supabase/types").Json,
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
    const { data, error } = await context.supabase
      .from("morning_reports")
      .select("*")
      .order("report_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? mapRow(data as unknown as Record<string, unknown>) : null;
  });

/** Admin manual retry — re-delivers the current-day brief. */
export const retryMorningBriefDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase
      .rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    return runMorningBrief({ forceRedeliver: true });
  });

/** Utility for callers rendering the disclaimer block on the UI. */
export function morningBriefDisclaimer(): string {
  return composeDisclaimerBlock();
}