// Phase 2I-C-2 — Gann Gap persistence, outcome, historical, scheduler & diagnostics
// server functions. All writes flow through admin-only SECURITY DEFINER RPCs;
// reads use RLS-scoped selects. No SQL is duplicated here.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { GANN_GAP_CONFIG_VERSION, GANN_GAP_FORMULA_VERSION } from "./formula-version";
import { OUTCOME_RULE_VERSION, classifyActualOutcome } from "./outcome-rules";
import {
  DEFAULT_MIN_HISTORICAL_SAMPLE,
  evaluateHistoricalAccuracy,
  type FrozenPredictionRecord,
  type HistoricalAccuracyMetrics,
  type OutcomeRecord,
} from "./historical";
import { redactValue } from "./diagnostics-redact";
import type { GannGapOutlook, GannGapOutlookLabel } from "./types";
import { getGannGapOutlook } from "./gann-gap.functions";

// ─────────────────────────────────────────────────────────────
// Persisted row shapes (public projections; keep in sync with DB types).
// ─────────────────────────────────────────────────────────────

export interface PersistedPredictionRow {
  readonly predictionId: string;
  readonly tradingDate: string;
  readonly nextTradingDate: string | null;
  readonly lifecycle: string;
  readonly baseOutlook: GannGapOutlookLabel;
  readonly confidenceBand: string | null;
  readonly referencePrice: number | null;
  readonly relevantLevel: number | null;
  readonly lowerLevel: number | null;
  readonly upperLevel: number | null;
  readonly distancePoints: number | null;
  readonly distancePct: number | null;
  readonly formulaVersion: string;
  readonly configVersion: string;
  readonly frozenAt: string | null;
  readonly source: string | null;
  readonly providerAlias: string | null;
  readonly confirmations: unknown[] | Record<string, unknown> | null;
  readonly closingZone: Record<string, unknown> | null;
  readonly capability: Record<string, unknown> | null;
  readonly evaluatedAt: string | null;
  readonly createdAt: string;
}

export interface PersistedOutcomeRow {
  readonly id: string;
  readonly predictionId: string;
  readonly predictionTradingDate: string;
  readonly outcomeTradingDate: string;
  readonly previousClose: number | null;
  readonly nextOpen: number | null;
  readonly gapPoints: number | null;
  readonly gapPercent: number | null;
  readonly actualOutcome: string;
  readonly outcomeRuleVersion: string;
  readonly source: string | null;
  readonly providerAlias: string | null;
  readonly evaluatedAt: string;
}

function mapPredictionRow(r: Record<string, unknown>): PersistedPredictionRow {
  return {
    predictionId: String(r.prediction_id),
    tradingDate: String(r.trading_date),
    nextTradingDate: r.next_trading_date == null ? null : String(r.next_trading_date),
    lifecycle: String(r.lifecycle),
    baseOutlook: String(r.base_outlook) as GannGapOutlookLabel,
    confidenceBand: r.confidence_band == null ? null : String(r.confidence_band),
    referencePrice: r.reference_price == null ? null : Number(r.reference_price),
    relevantLevel: r.relevant_level == null ? null : Number(r.relevant_level),
    lowerLevel: r.lower_level == null ? null : Number(r.lower_level),
    upperLevel: r.upper_level == null ? null : Number(r.upper_level),
    distancePoints: r.distance_points == null ? null : Number(r.distance_points),
    distancePct: r.distance_pct == null ? null : Number(r.distance_pct),
    formulaVersion: String(r.formula_version),
    configVersion: String(r.config_version),
    frozenAt: r.frozen_at == null ? null : String(r.frozen_at),
    source: r.source == null ? null : String(r.source),
    providerAlias: r.provider_alias == null ? null : String(r.provider_alias),
    confirmations: (r.confirmations as any) ?? [],
    closingZone: (r.closing_zone as any) ?? null,
    capability: (r.capability as any) ?? null,
    evaluatedAt: r.evaluated_at == null ? null : String(r.evaluated_at),
    createdAt: String(r.created_at ?? new Date().toISOString()),
  };
}

function mapOutcomeRow(r: Record<string, unknown>): PersistedOutcomeRow {
  return {
    id: String(r.id),
    predictionId: String(r.prediction_id),
    predictionTradingDate: String(r.prediction_trading_date),
    outcomeTradingDate: String(r.outcome_trading_date),
    previousClose: r.previous_close == null ? null : Number(r.previous_close),
    nextOpen: r.next_open == null ? null : Number(r.next_open),
    gapPoints: r.gap_points == null ? null : Number(r.gap_points),
    gapPercent: r.gap_percent == null ? null : Number(r.gap_percent),
    actualOutcome: String(r.actual_outcome),
    outcomeRuleVersion: String(r.outcome_rule_version),
    source: r.source == null ? null : String(r.source),
    providerAlias: r.provider_alias == null ? null : String(r.provider_alias),
    evaluatedAt: String(r.evaluated_at),
  };
}

function buildRowFromOutlook(o: GannGapOutlook): Record<string, unknown> {
  const relevant = o.zone?.nearestBelow?.level ?? o.zone?.nearestAbove?.level ?? null;
  const distancePoints = relevant != null && o.reference != null ? relevant - o.reference : null;
  const distancePct = distancePoints != null && o.reference ? distancePoints / o.reference : null;
  return {
    prediction_id: `gg-${o.tradingDate}-${o.formulaVersion}-${o.configVersion}`,
    trading_date: o.tradingDate,
    next_trading_date: o.nextTradingDate || null,
    lifecycle: o.lifecycle,
    base_outlook: o.label,
    confidence_band: o.confidence ?? null,
    reference_price: o.reference,
    previous_close: o.reference,
    relevant_level: relevant,
    lower_level: o.zone?.nearestBelow?.level ?? null,
    upper_level: o.zone?.nearestAbove?.level ?? null,
    distance_points: distancePoints,
    distance_pct: distancePct,
    closing_zone: o.zone ?? null,
    confirmations: o.confirmations,
    capability: { source: o.source, reasons: o.reasons, featureEnabled: o.featureEnabled },
    source: o.source,
    provider_alias: null,
    formula_version: o.formulaVersion,
    config_version: o.configVersion,
    calendar_provenance: null,
    frozen_at: o.lifecycle === "FROZEN" ? o.observedAt : null,
    evaluated_at: o.observedAt,
  };
}

async function assertAdmin(ctx: { supabase: any; userId: string }): Promise<void> {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("forbidden");
}

// ─────────────────────────────────────────────────────────────
// Freeze / write
// ─────────────────────────────────────────────────────────────

export const freezeGannGapPrediction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: boolean; row: PersistedPredictionRow | null; reason?: string }> => {
    await assertAdmin(context);
    const outlook = await getGannGapOutlook();
    if (!outlook.featureEnabled) return { ok: false, row: null, reason: "feature-disabled" };
    if (outlook.lifecycle === "PENDING") return { ok: false, row: null, reason: "before-cutoff" };
    if (outlook.reference == null) return { ok: false, row: null, reason: "reference-unavailable" };

    const row = buildRowFromOutlook({ ...outlook, lifecycle: "FROZEN" });
    const { data, error } = await context.supabase.rpc("gann_gap_upsert_prediction", { _row: row as any });
    if (error) throw new Error(error.message);
    return { ok: true, row: mapPredictionRow(data as Record<string, unknown>) };
  });

// ─────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────

export const getLatestGannGapPrediction = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PersistedPredictionRow | null> => {
    const { data, error } = await context.supabase
      .from("gann_gap_predictions")
      .select("*")
      .order("trading_date", { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);
    const arr = data as Record<string, unknown>[] | null;
    return arr && arr.length ? mapPredictionRow(arr[0]!) : null;
  });

export const getGannGapPredictionHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { limit?: number } | undefined) => ({ limit: Math.max(1, Math.min(200, d?.limit ?? 60)) }))
  .handler(async ({ context, data }): Promise<PersistedPredictionRow[]> => {
    const { data: rows, error } = await context.supabase
      .from("gann_gap_predictions")
      .select("*")
      .order("trading_date", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return (rows as Record<string, unknown>[] | null ?? []).map(mapPredictionRow);
  });

export const getGannGapOutcomeHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { limit?: number } | undefined) => ({ limit: Math.max(1, Math.min(200, d?.limit ?? 60)) }))
  .handler(async ({ context, data }): Promise<PersistedOutcomeRow[]> => {
    const { data: rows, error } = await context.supabase
      .from("gann_gap_outcomes")
      .select("*")
      .order("outcome_trading_date", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return (rows as Record<string, unknown>[] | null ?? []).map(mapOutcomeRow);
  });

// ─────────────────────────────────────────────────────────────
// Outcome evaluation — admin
// ─────────────────────────────────────────────────────────────

export const evaluatePendingGannGapOutcome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ evaluated: number; skipped: number; details: readonly string[] }> => {
    await assertAdmin(context);
    const { data: preds, error: pe } = await context.supabase
      .from("gann_gap_predictions")
      .select("prediction_id, trading_date, next_trading_date, previous_close, reference_price, frozen_at, lifecycle")
      .eq("lifecycle", "FROZEN")
      .order("trading_date", { ascending: false })
      .limit(50);
    if (pe) throw new Error(pe.message);
    const rows = (preds ?? []) as Record<string, unknown>[];

    // Pull existing outcomes to avoid re-work.
    const ids = rows.map((r) => String(r.prediction_id));
    let existingIds = new Set<string>();
    if (ids.length) {
      const { data: outs } = await context.supabase
        .from("gann_gap_outcomes")
        .select("prediction_id, outcome_rule_version")
        .in("prediction_id", ids)
        .eq("outcome_rule_version", OUTCOME_RULE_VERSION);
      existingIds = new Set((outs ?? []).map((o: any) => String(o.prediction_id)));
    }

    // Consume canonical market data once for the current session's open.
    const { getMarketData } = await import("@/lib/market.functions");
    let liveOpen: number | null = null;
    try {
      const md = await getMarketData();
      liveOpen = md?.nifty?.livePrice ?? null;
    } catch {
      liveOpen = null;
    }

    const details: string[] = [];
    let evaluated = 0, skipped = 0;
    for (const p of rows) {
      const pid = String(p.prediction_id);
      if (existingIds.has(pid)) { skipped++; continue; }
      const nextDate = p.next_trading_date == null ? null : String(p.next_trading_date);
      const previousClose = p.previous_close == null ? null : Number(p.previous_close);
      if (!nextDate || previousClose == null) { skipped++; details.push(`${pid}: missing next-date or previous close`); continue; }
      // Only evaluate when we're at or after the next session; use liveOpen.
      const cls = classifyActualOutcome({ previousClose, nextOpen: liveOpen });
      if (cls.outcome === "OUTCOME_UNAVAILABLE") { skipped++; details.push(`${pid}: ${cls.reason}`); continue; }

      const outcomeRow: Record<string, unknown> = {
        prediction_id: pid,
        prediction_trading_date: String(p.trading_date),
        outcome_trading_date: nextDate,
        previous_close: previousClose,
        next_open: liveOpen,
        gap_points: cls.gapPoints,
        gap_percent: cls.gapPercent,
        actual_outcome: cls.outcome,
        source: "LIVE",
        provider_alias: null,
        capability: { reason: cls.reason },
        outcome_rule_version: OUTCOME_RULE_VERSION,
      };
      const { error } = await context.supabase.rpc("gann_gap_upsert_outcome", { _row: outcomeRow as any });
      if (error) { skipped++; details.push(`${pid}: ${error.message}`); continue; }
      evaluated++;
      details.push(`${pid}: ${cls.outcome}`);
    }
    return { evaluated, skipped, details };
  });

// ─────────────────────────────────────────────────────────────
// Historical validation
// ─────────────────────────────────────────────────────────────

export interface GannGapHistoricalValidation {
  readonly metrics: HistoricalAccuracyMetrics;
  readonly minSampleForRate: number;
  readonly minSampleForConfidence: number;
  readonly showRate: boolean;
  readonly showConfidence: boolean;
  readonly formulaVersion: string;
  readonly configVersion: string;
  readonly outcomeRuleVersion: string;
  readonly generatedAt: string;
}

export const getGannGapHistoricalValidation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GannGapHistoricalValidation> => {
    // Only compare like-for-like: current formula + config + outcome rule versions.
    const { data: preds, error: pe } = await context.supabase
      .from("gann_gap_predictions")
      .select("prediction_id, trading_date, next_trading_date, base_outlook, reference_price, formula_version, config_version, frozen_at")
      .eq("lifecycle", "FROZEN")
      .eq("formula_version", GANN_GAP_FORMULA_VERSION)
      .eq("config_version", GANN_GAP_CONFIG_VERSION)
      .order("trading_date", { ascending: false })
      .limit(500);
    if (pe) throw new Error(pe.message);
    const predictionRows: FrozenPredictionRecord[] = ((preds ?? []) as any[]).map((r) => ({
      predictionId: String(r.prediction_id),
      tradingDate: String(r.trading_date),
      nextTradingDate: String(r.next_trading_date ?? ""),
      label: String(r.base_outlook) as GannGapOutlookLabel,
      reference: r.reference_price == null ? null : Number(r.reference_price),
      formulaVersion: String(r.formula_version),
      frozenAt: String(r.frozen_at ?? r.trading_date),
    }));

    const ids = predictionRows.map((p) => p.predictionId);
    let outcomeRows: OutcomeRecord[] = [];
    if (ids.length) {
      const { data: outs, error: oe } = await context.supabase
        .from("gann_gap_outcomes")
        .select("prediction_id, actual_outcome, outcome_rule_version, evaluated_at")
        .in("prediction_id", ids)
        .eq("outcome_rule_version", OUTCOME_RULE_VERSION);
      if (oe) throw new Error(oe.message);
      outcomeRows = ((outs ?? []) as any[]).map((r) => ({
        predictionId: String(r.prediction_id),
        outcome: String(r.actual_outcome) as any,
        ruleVersion: String(r.outcome_rule_version),
        evaluatedAt: String(r.evaluated_at),
      }));
    }

    const metrics = evaluateHistoricalAccuracy(predictionRows, outcomeRows, {
      minSampleSize: DEFAULT_MIN_HISTORICAL_SAMPLE,
    });

    return {
      metrics,
      minSampleForRate: 30,
      minSampleForConfidence: 100,
      showRate: metrics.evaluated >= 30,
      showConfidence: metrics.evaluated >= 100,
      formulaVersion: GANN_GAP_FORMULA_VERSION,
      configVersion: GANN_GAP_CONFIG_VERSION,
      outcomeRuleVersion: OUTCOME_RULE_VERSION,
      generatedAt: new Date().toISOString(),
    };
  });

// ─────────────────────────────────────────────────────────────
// Scheduler state + diagnostics
// ─────────────────────────────────────────────────────────────

export interface GannGapSchedulerState {
  readonly enabled: boolean;
  readonly lastRunAt: string | null;
  readonly lastRunKind: string | null;
  readonly lastError: string | null;
  readonly updatedAt: string | null;
  readonly productionSchedule: "DISABLED";
}

export const getGannGapSchedulerState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GannGapSchedulerState> => {
    const { data, error } = await context.supabase
      .from("gann_gap_scheduler_state")
      .select("*")
      .order("id", { ascending: true })
      .limit(1);
    if (error) throw new Error(error.message);
    const row = ((data ?? []) as any[])[0];
    return {
      enabled: !!row?.enabled,
      lastRunAt: row?.last_run_at ?? null,
      lastRunKind: row?.last_run_kind ?? null,
      lastError: row?.last_error ?? null,
      updatedAt: row?.updated_at ?? null,
      productionSchedule: "DISABLED",
    };
  });

export interface GannGapDiagnostics {
  readonly outlook: GannGapOutlook | null;
  readonly latestPrediction: PersistedPredictionRow | null;
  readonly latestOutcome: PersistedOutcomeRow | null;
  readonly predictionCount: number;
  readonly outcomeCount: number;
  readonly historical: GannGapHistoricalValidation;
  readonly scheduler: GannGapSchedulerState;
  readonly formulaVersion: string;
  readonly configVersion: string;
  readonly outcomeRuleVersion: string;
  readonly generatedAt: string;
  readonly safeExport: unknown;
}

export const getGannGapDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GannGapDiagnostics> => {
    await assertAdmin(context);
    const [outlookRes, predRes, outRes, predCountRes, outCountRes, histRes, schedRes] = await Promise.allSettled([
      getGannGapOutlook(),
      getLatestGannGapPrediction(),
      context.supabase
        .from("gann_gap_outcomes")
        .select("*")
        .order("evaluated_at", { ascending: false })
        .limit(1),
      context.supabase.from("gann_gap_predictions").select("*", { count: "exact", head: true }),
      context.supabase.from("gann_gap_outcomes").select("*", { count: "exact", head: true }),
      getGannGapHistoricalValidation(),
      getGannGapSchedulerState(),
    ]);

    const outlook = outlookRes.status === "fulfilled" ? outlookRes.value : null;
    const latestPrediction = predRes.status === "fulfilled" ? predRes.value : null;
    const latestOutcomeRow = outRes.status === "fulfilled"
      ? ((outRes.value as any)?.data as Record<string, unknown>[] | null)?.[0] ?? null
      : null;
    const predictionCount = predCountRes.status === "fulfilled" ? Number((predCountRes.value as any)?.count ?? 0) : 0;
    const outcomeCount = outCountRes.status === "fulfilled" ? Number((outCountRes.value as any)?.count ?? 0) : 0;
    const historical = histRes.status === "fulfilled" ? histRes.value : {
      metrics: evaluateHistoricalAccuracy([], []),
      minSampleForRate: 30, minSampleForConfidence: 100,
      showRate: false, showConfidence: false,
      formulaVersion: GANN_GAP_FORMULA_VERSION,
      configVersion: GANN_GAP_CONFIG_VERSION,
      outcomeRuleVersion: OUTCOME_RULE_VERSION,
      generatedAt: new Date().toISOString(),
    };
    const scheduler: GannGapSchedulerState = schedRes.status === "fulfilled" ? schedRes.value : {
      enabled: false, lastRunAt: null, lastRunKind: null, lastError: null, updatedAt: null, productionSchedule: "DISABLED",
    };

    const bundle = {
      outlook, latestPrediction, latestOutcome: latestOutcomeRow ? mapOutcomeRow(latestOutcomeRow) : null,
      predictionCount, outcomeCount, historical, scheduler,
      formulaVersion: GANN_GAP_FORMULA_VERSION,
      configVersion: GANN_GAP_CONFIG_VERSION,
      outcomeRuleVersion: OUTCOME_RULE_VERSION,
      generatedAt: new Date().toISOString(),
    };
    return { ...bundle, safeExport: redactDiagnostics(bundle) };
  });