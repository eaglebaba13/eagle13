// Phase 44B / 67A - Morning brief server functions.
// Server-only persistence and Telegram delivery lifecycle for the daily
// Multi-Asset Intelligence morning brief. Diagnostics never expose secrets.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/lib/auth/require-supabase-auth";
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

type Json = import("@/integrations/supabase/types").Json;

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
  readonly deliveryStatus: "PENDING" | "SENT" | "FAILED" | "CONFIG_MISSING" | "PARTIAL";
  readonly deliveryError: string | null;
  readonly deliveryAttempts: number;
  readonly telegramMessageIds: readonly number[];
}

export type MorningBriefUiState =
  | "NO_REPORT"
  | "CONFIG_MISSING"
  | "READY"
  | "SENDING"
  | "DELIVERED"
  | "PARTIAL"
  | "FAILED"
  | "MARKET_CLOSED_INFORMATIONAL";

export interface MorningBriefDeliveryActionResult {
  readonly status: MorningBriefUiState;
  readonly report: MorningReportRecord | null;
  readonly safeError: string | null;
}

export interface MorningBriefDiagnosticsSummary {
  readonly generatorStatus: "READY" | "NO_REPORT" | "FAILED";
  readonly telegramConfigurationStatus: "READY" | "CONFIG_MISSING" | "DISABLED";
  readonly latestReportStatus: MorningBriefUiState;
  readonly latestReportGeneratedAt: string | null;
  readonly latestDeliveryStatus: MorningReportRecord["deliveryStatus"] | "NO_REPORT";
  readonly latestDeliveryAttempt: string | null;
  readonly latestDeliverySuccess: boolean;
  readonly deliveryRetryCount: number;
  readonly schedulerRuntime: "EXTERNAL_HTTP_CRON" | "MANUAL_ONLY";
  readonly schedulerRegistrationStatus: "AUTOMATION_INACTIVE";
  readonly automaticDeliveryActive: false;
  readonly lastSafeError: string | null;
  readonly marketSessionState: "OPEN" | "MARKET_CLOSED" | "UNKNOWN";
  readonly persistenceStatus: "READY" | "UNAVAILABLE";
}

function sanitizeBriefError(message: string | null | undefined): string | null {
  if (!message) return null;
  return message.replace(/token|secret|authorization|cookie|api[-_]?key|bearer|chat[_ -]?id/gi, "[REDACTED]").slice(0, 160);
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
    deliveryStatus: String(row.delivery_status) as MorningReportRecord["deliveryStatus"],
    deliveryError: sanitizeBriefError((row.delivery_error as string | null) ?? null),
    deliveryAttempts: Number(row.delivery_attempts ?? 0),
    telegramMessageIds: Array.isArray(row.telegram_message_ids) ? (row.telegram_message_ids as number[]) : [],
  };
}

function uiStateForRecord(record: MorningReportRecord | null): MorningBriefUiState {
  if (!record) return "NO_REPORT";
  if (record.deliveryStatus === "SENT") return "DELIVERED";
  if (record.deliveryStatus === "CONFIG_MISSING") return "CONFIG_MISSING";
  if (record.deliveryStatus === "PARTIAL") return "PARTIAL";
  if (record.deliveryStatus === "FAILED") return "FAILED";
  if (record.dataQuality === "CLOSED") return "MARKET_CLOSED_INFORMATIONAL";
  return "READY";
}

function deliveryStatusFromOutcome(outcome: { delivered: boolean; status: string }): MorningReportRecord["deliveryStatus"] {
  if (outcome.delivered) return "SENT";
  if (outcome.status === "CONFIG_MISSING") return "CONFIG_MISSING";
  if (outcome.status === "PARTIAL") return "PARTIAL";
  return "FAILED";
}

function marketSessionState(now = Date.now()): "OPEN" | "MARKET_CLOSED" | "UNKNOWN" {
  if (!Number.isFinite(now)) return "UNKNOWN";
  const ist = new Date(now + 330 * 60_000);
  const day = ist.getUTCDay();
  if (day === 0 || day === 6) return "MARKET_CLOSED";
  const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return minutes >= 9 * 60 + 15 && minutes <= 15 * 60 + 30 ? "OPEN" : "MARKET_CLOSED";
}

async function persistDeliveryOutcome(record: MorningReportRecord, outcome: { delivered: boolean; status: string; error?: string; messageIds: readonly number[] }) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin
    .from("morning_reports")
    .update({
      delivery_status: deliveryStatusFromOutcome(outcome),
      delivery_error: sanitizeBriefError(outcome.error) ?? null,
      delivery_attempts: record.deliveryAttempts + 1,
      telegram_message_ids: [...outcome.messageIds] as unknown as Json,
      last_attempted_at: new Date().toISOString(),
    })
    .eq("id", record.id)
    .select("*")
    .single();
}

export async function runMorningBrief(opts?: {
  readonly forceRedeliver?: boolean;
  readonly forceRebuild?: boolean;
}): Promise<MorningReportRecord> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { buildLivePayload } = await import("./report-live.server");
  const { deliverMorningBrief } = await import("./report-telegram.server");
  const now = Date.now();
  const reportDate = todayIst(now);
  const reportKey = buildReportKey(reportDate);
  const generatedAt = new Date(now).toISOString();

  const existing = await supabaseAdmin
    .from("morning_reports")
    .select("*")
    .eq("report_key", reportKey)
    .maybeSingle();

  let payload: ComposeInput;
  let dataQuality: DataQuality = "PARTIAL";
  let record: MorningReportRecord;

  if (existing.data && !opts?.forceRebuild) {
    record = mapRow(existing.data as Record<string, unknown>);
    payload = record.payload;
    dataQuality = record.dataQuality;
  } else {
    try {
      payload = await buildLivePayload(reportDate, generatedAt);
      dataQuality = payload.overallStatus;
    } catch {
      payload = buildEmptyPayload(reportDate, generatedAt);
      dataQuality = "PARTIAL";
    }
    if (existing.data) {
      const upd = await supabaseAdmin
        .from("morning_reports")
        .update({
          payload: payload as unknown as Json,
          data_quality: dataQuality,
          generated_at: generatedAt,
          delivery_status: "PENDING",
          delivery_error: null,
        })
        .eq("report_key", reportKey)
        .select("*")
        .single();
      if (upd.error || !upd.data) throw new Error(`morning_report_rebuild_failed:${sanitizeBriefError(upd.error?.message) ?? "unknown"}`);
      record = mapRow(upd.data as Record<string, unknown>);
    } else {
      const inserted = await supabaseAdmin
        .from("morning_reports")
        .insert({
          report_key: reportKey,
          report_date: reportDate,
          report_type: MORNING_REPORT_TYPE,
          timezone: MORNING_REPORT_TIMEZONE,
          version: MORNING_REPORT_VERSION,
          payload: payload as unknown as Json,
          data_quality: dataQuality,
          generated_at: generatedAt,
          delivery_status: "PENDING",
          delivery_attempts: 0,
        })
        .select("*")
        .single();
      if (inserted.error || !inserted.data) throw new Error(`morning_report_insert_failed:${sanitizeBriefError(inserted.error?.message) ?? "unknown"}`);
      record = mapRow(inserted.data as Record<string, unknown>);
    }
  }

  if (record.deliveryStatus === "SENT" && !opts?.forceRedeliver) return record;

  const outcome = await deliverMorningBrief({
    reportId: payload.reportId,
    generatedAt: payload.generatedAt,
    sections: composeMorningReport(payload),
    deliveryId: `morning-brief::${record.reportKey}`,
  });
  const updated = await persistDeliveryOutcome(record, outcome);
  if (updated.error || !updated.data) return record;

  return mapRow(updated.data as Record<string, unknown>);
}

async function retryLatestPersistedMorningBrief(): Promise<MorningBriefDeliveryActionResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { deliverMorningBrief } = await import("./report-telegram.server");
  const latest = await supabaseAdmin
    .from("morning_reports")
    .select("*")
    .order("report_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest.error) throw new Error(sanitizeBriefError(latest.error.message) ?? "morning_report_lookup_failed");
  if (!latest.data) return { status: "NO_REPORT", report: null, safeError: null };

  const record = mapRow(latest.data as Record<string, unknown>);
  if (record.deliveryStatus === "SENT") return { status: "DELIVERED", report: record, safeError: null };

  const outcome = await deliverMorningBrief({
    reportId: record.payload.reportId,
    generatedAt: record.payload.generatedAt,
    sections: composeMorningReport(record.payload),
    deliveryId: `morning-brief::${record.reportKey}`,
  });
  const updated = await persistDeliveryOutcome(record, outcome);
  if (updated.error || !updated.data) {
    return { status: uiStateForRecord(record), report: record, safeError: sanitizeBriefError(updated.error?.message ?? "morning_report_delivery_update_failed") };
  }
  const next = mapRow(updated.data as Record<string, unknown>);
  return { status: uiStateForRecord(next), report: next, safeError: sanitizeBriefError(next.deliveryError) };
}

export const getLatestMorningReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("morning_reports")
      .select("*")
      .order("report_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(sanitizeBriefError(error.message) ?? "morning_report_lookup_failed");
    return data ? mapRow(data as unknown as Record<string, unknown>) : null;
  });

export const retryMorningBriefDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MorningBriefDeliveryActionResult> => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    return retryLatestPersistedMorningBrief();
  });

export const getMorningBriefDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MorningBriefDiagnosticsSummary> => {
    const { validateTelegramMorningBriefConfiguration } = await import("./report-telegram.server");
    const { data, error } = await context.supabase
      .from("morning_reports")
      .select("*")
      .order("report_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    const record = data ? mapRow(data as unknown as Record<string, unknown>) : null;
    const safeError = sanitizeBriefError(error?.message ?? record?.deliveryError ?? null);
    return {
      generatorStatus: error ? "FAILED" : record ? "READY" : "NO_REPORT",
      telegramConfigurationStatus: validateTelegramMorningBriefConfiguration().status,
      latestReportStatus: uiStateForRecord(record),
      latestReportGeneratedAt: record?.generatedAt ?? null,
      latestDeliveryStatus: record?.deliveryStatus ?? "NO_REPORT",
      latestDeliveryAttempt: (data as { last_attempted_at?: string | null } | null)?.last_attempted_at ?? null,
      latestDeliverySuccess: record?.deliveryStatus === "SENT",
      deliveryRetryCount: Math.max(0, (record?.deliveryAttempts ?? 0) - 1),
      schedulerRuntime: "EXTERNAL_HTTP_CRON",
      schedulerRegistrationStatus: "AUTOMATION_INACTIVE",
      automaticDeliveryActive: false,
      lastSafeError: safeError,
      marketSessionState: marketSessionState(),
      persistenceStatus: error ? "UNAVAILABLE" : "READY",
    };
  });

export function morningBriefDisclaimer(): string {
  return composeDisclaimerBlock();
}
