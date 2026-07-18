// Phase 3C-2 — Smart Alert Engine persistence + runner (server functions).
//
// Pure orchestration on top of the deterministic engine in `./engine`.
// Every read is RLS-scoped to the caller; writes stay within the caller's
// user_id (the RLS policies enforce this at the database level). No broker
// touches. No formula math. No trade execution.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { getDecisionSnapshot } from "@/lib/decision.functions";
import { getGtiSummary } from "@/lib/gti-summary/gti-summary.functions";
import { getGannGapOutlook } from "@/lib/gann-gap/gann-gap.functions";
import { getOptionStrategyTerminal } from "@/lib/option-strategy-terminal/terminal.functions";
import { getAiMarketAssistant } from "@/lib/ai-market-assistant/assistant.functions";

import { runAlertEngine } from "./engine";
import { makeEmptyCheckpoint } from "./dedupe";
import { defaultSubscription, allAlertTypes } from "./subscriptions";
import {
  ALERT_DISCLAIMER,
  SMART_ALERTS_RULES_VERSION,
  type AlertCheckpoint,
  type AlertEvaluationContext,
  type AlertEvent,
  type AlertFreshness,
  type AlertPriority,
  type AlertSubscription,
  type AlertType,
  type CanonicalDirection,
  type CanonicalVixRegime,
  type EngineDiagnostics,
  type RuntimeModuleView,
} from "./types";

// ─────────────────────────────────────────────────────────────
// Row shapes (public projection; keep in sync with DB types).
// ─────────────────────────────────────────────────────────────

export interface PersistedAlertEventRow {
  readonly id: string;
  readonly fingerprint: string;
  readonly type: AlertType;
  readonly priority: AlertPriority;
  readonly title: string;
  readonly summary: string;
  readonly instrument: string | null;
  readonly tradingDate: string;
  readonly generatedAt: string;
  readonly readAt: string | null;
  readonly dismissedAt: string | null;
  readonly rulesVersion: string;
  readonly sourceModules: readonly string[];
  readonly payload: AlertEvent;
}

export interface PersistedSubscriptionRow extends AlertSubscription {
  readonly updatedAt: string;
}

export interface PersistedCheckpointRow {
  readonly userId: string;
  readonly rulesVersion: string;
  readonly lastEvaluatedAt: string | null;
  readonly lastSuccessAt: string | null;
  readonly lastError: string | null;
  readonly checkpoint: AlertCheckpoint;
}

function safeParseJson<T>(v: unknown, fallback: T): T {
  if (v == null) return fallback;
  if (typeof v === "object") return v as T;
  if (typeof v === "string") {
    try { return JSON.parse(v) as T; } catch { return fallback; }
  }
  return fallback;
}

function mapEventRow(r: Record<string, unknown>): PersistedAlertEventRow {
  const payload = safeParseJson<AlertEvent>(r.payload, {} as AlertEvent);
  return {
    id: String(r.id),
    fingerprint: String(r.fingerprint),
    type: String(r.type) as AlertType,
    priority: String(r.priority) as AlertPriority,
    title: String(r.title ?? ""),
    summary: String(r.summary ?? ""),
    instrument: r.instrument == null ? null : String(r.instrument),
    tradingDate: String(r.trading_date),
    generatedAt: String(r.generated_at),
    readAt: r.read_at == null ? null : String(r.read_at),
    dismissedAt: r.dismissed_at == null ? null : String(r.dismissed_at),
    rulesVersion: String(r.rules_version ?? SMART_ALERTS_RULES_VERSION),
    sourceModules: safeParseJson<string[]>(r.source_modules, []),
    payload,
  };
}

function mapSubscriptionRow(userId: string, r: Record<string, unknown> | null): PersistedSubscriptionRow {
  if (!r) {
    const s = defaultSubscription(userId);
    return { ...s, updatedAt: new Date().toISOString() };
  }
  const types = safeParseJson<Record<string, boolean>>(r.types, {});
  const instruments = safeParseJson<string[]>(r.instruments, []);
  const quietHours = safeParseJson<AlertSubscription["quietHours"]>(r.quiet_hours, null);
  const merged: Record<AlertType, boolean> = { ...defaultSubscription(userId).types };
  for (const t of allAlertTypes()) {
    if (typeof types[t] === "boolean") merged[t] = types[t] as boolean;
  }
  return {
    userId: String(r.user_id ?? userId),
    types: merged,
    instruments: Array.isArray(instruments) ? instruments : [],
    minimumPriority: (String(r.minimum_priority ?? "LOW") as AlertPriority),
    inAppEnabled: r.in_app_enabled !== false,
    emailEnabled: !!r.email_enabled,
    telegramEnabled: !!r.telegram_enabled,
    webhookEnabled: !!r.webhook_enabled,
    quietHours: quietHours ?? null,
    cooldownOverrideSec: r.cooldown_override_sec == null ? null : Number(r.cooldown_override_sec),
    timezone: String(r.timezone ?? "Asia/Kolkata"),
    updatedAt: String(r.updated_at ?? new Date().toISOString()),
  };
}

function mapCheckpointRow(userId: string, r: Record<string, unknown> | null): PersistedCheckpointRow {
  if (!r) {
    return {
      userId,
      rulesVersion: SMART_ALERTS_RULES_VERSION,
      lastEvaluatedAt: null,
      lastSuccessAt: null,
      lastError: null,
      checkpoint: makeEmptyCheckpoint(userId, new Date().toISOString()),
    };
  }
  const previous = safeParseJson<AlertCheckpoint["previous"]>(r.previous, {});
  const fingerprintsRaw = safeParseJson<{
    lastFingerprintsByType?: Record<string, string>;
    lastEmittedAtByFingerprint?: Record<string, string>;
    emittedFingerprintsThisSession?: string[];
  }>(r.fingerprints, {});
  return {
    userId: String(r.user_id ?? userId),
    rulesVersion: String(r.rules_version ?? SMART_ALERTS_RULES_VERSION),
    lastEvaluatedAt: r.last_evaluated_at == null ? null : String(r.last_evaluated_at),
    lastSuccessAt: r.last_success_at == null ? null : String(r.last_success_at),
    lastError: r.last_error == null ? null : String(r.last_error),
    checkpoint: {
      userId,
      updatedAt: String(r.updated_at ?? new Date().toISOString()),
      lastFingerprintsByType: fingerprintsRaw.lastFingerprintsByType ?? {},
      lastEmittedAtByFingerprint: fingerprintsRaw.lastEmittedAtByFingerprint ?? {},
      emittedFingerprintsThisSession: fingerprintsRaw.emittedFingerprintsThisSession ?? [],
      previous: previous ?? {},
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Context normalisation helpers.
// ─────────────────────────────────────────────────────────────

function biasFromAction(action: string | undefined): CanonicalDirection {
  if (!action) return "UNKNOWN";
  if (action === "STRONG_BUY_CE" || action === "BUY_CE") return "BULLISH";
  if (action === "STRONG_BUY_PE" || action === "BUY_PE") return "BEARISH";
  if (action === "WAIT") return "NEUTRAL";
  return "UNKNOWN";
}

function normaliseState(s: string | undefined | null): CanonicalDirection {
  const t = (s ?? "").toUpperCase();
  if (t.includes("BULL")) return "BULLISH";
  if (t.includes("BEAR")) return "BEARISH";
  if (t.includes("NEUTRAL") || t.includes("RANGE")) return "NEUTRAL";
  return "UNKNOWN";
}

function vixToRegime(v: number | null | undefined): CanonicalVixRegime {
  if (v == null || !Number.isFinite(v)) return "UNKNOWN";
  if (v < 15) return "LOW";
  if (v <= 20) return "MID";
  return "HIGH";
}

function sourceToFreshness(source: string | null | undefined, available: boolean): AlertFreshness {
  if (!available) return "UNKNOWN";
  const s = String(source ?? "").toUpperCase();
  if (s === "LIVE") return "LIVE";
  if (s === "MIXED" || s === "PARTIAL") return "MIXED";
  if (s === "RESEARCH_DEMO" || s === "DEMO") return "RESEARCH_DEMO";
  if (s === "STALE") return "STALE";
  return "MIXED";
}

function gapLifecycle(l: string | null | undefined): "PENDING" | "PROVISIONAL" | "FROZEN" | "OUTCOME" {
  const s = (l ?? "PENDING").toUpperCase();
  if (s === "FROZEN") return "FROZEN";
  if (s === "EVAL" || s === "PROVISIONAL") return "PROVISIONAL";
  if (s === "OUTCOME") return "OUTCOME";
  return "PENDING";
}

function labelToBias(label: string | null | undefined): CanonicalDirection {
  const s = (label ?? "").toUpperCase();
  if (s.includes("UP") || s.includes("BULL")) return "BULLISH";
  if (s.includes("DOWN") || s.includes("BEAR")) return "BEARISH";
  if (s.includes("NEUTRAL") || s.includes("INDECISION") || s.includes("FLAT")) return "NEUTRAL";
  return "UNKNOWN";
}

function strategyBiasToCanonical(b: string | undefined | null): CanonicalDirection {
  if (!b) return "UNKNOWN";
  if (b === "BULL") return "BULLISH";
  if (b === "BEAR") return "BEARISH";
  if (b === "NEUTRAL" || b === "VOL_LONG" || b === "VOL_SHORT") return "NEUTRAL";
  return "UNKNOWN";
}

function assistantBiasToCanonical(b: string | undefined | null): CanonicalDirection {
  if (!b) return "UNKNOWN";
  if (b === "BULLISH") return "BULLISH";
  if (b === "BEARISH") return "BEARISH";
  if (b === "NEUTRAL" || b === "CONFLICT") return "NEUTRAL";
  return "UNKNOWN";
}

// ─────────────────────────────────────────────────────────────
// Build AlertEvaluationContext from canonical envelopes.
// ─────────────────────────────────────────────────────────────

export async function buildEvaluationContext(userId: string): Promise<AlertEvaluationContext> {
  const generatedAt = new Date().toISOString();
  const tradingDate = generatedAt.slice(0, 10);

  const [decisionRes, gtiRes, gapRes, terminalRes, aiRes] = await Promise.allSettled([
    getDecisionSnapshot(),
    getGtiSummary(),
    getGannGapOutlook(),
    getOptionStrategyTerminal(),
    getAiMarketAssistant(),
  ]);

  const decision = decisionRes.status === "fulfilled" ? decisionRes.value : null;
  const gti = gtiRes.status === "fulfilled" ? gtiRes.value : null;
  const gap = gapRes.status === "fulfilled" ? gapRes.value : null;
  const terminal = terminalRes.status === "fulfilled" ? terminalRes.value : null;
  const ai = aiRes.status === "fulfilled" ? aiRes.value : null;

  const decisionFreshness: AlertFreshness = decision ? "LIVE" : "UNKNOWN";
  const gtiFreshness = sourceToFreshness(gti?.source, !!gti);
  const gapFreshness = sourceToFreshness(gap?.source, !!gap && gap.lifecycle !== "PENDING");

  const pcrDirection = decision?.capabilities.pcrCombined.direction ?? null;
  const pcrBias: CanonicalDirection =
    pcrDirection === "CE" ? "BULLISH" : pcrDirection === "PE" ? "BEARISH" : pcrDirection === "NEUTRAL" ? "NEUTRAL" : "UNKNOWN";

  const vixValue = decision?.context.vix ?? gti?.vix.value ?? null;

  const runtimeModules: RuntimeModuleView[] = [
    { module: "DECISION_ENGINE", status: decision ? "HEALTHY" : "UNAVAILABLE", reason: decision ? null : "unavailable" },
    { module: "GTI", status: gti ? "HEALTHY" : "UNAVAILABLE", reason: gti ? null : "unavailable" },
    { module: "COMBINED_PCR", status: pcrDirection ? "HEALTHY" : "DEGRADED", reason: pcrDirection ? null : "PCR direction unavailable" },
    { module: "MARKET_BREADTH", status: gti ? "HEALTHY" : "UNAVAILABLE", reason: gti ? null : "breadth unavailable" },
    { module: "INDIA_VIX", status: vixValue != null ? "HEALTHY" : "UNAVAILABLE", reason: vixValue == null ? "VIX unavailable" : null },
    { module: "GANN_GAP_OUTLOOK", status: gap ? "HEALTHY" : "UNAVAILABLE", reason: gap ? null : "outlook unavailable" },
    { module: "OPTION_STRATEGY_TERMINAL", status: terminal ? "HEALTHY" : "UNAVAILABLE", reason: terminal ? null : "terminal unavailable" },
    { module: "AI_MARKET_ASSISTANT", status: ai ? "HEALTHY" : "UNAVAILABLE", reason: ai ? null : "assistant unavailable" },
  ];
  const healthyCount = runtimeModules.filter((m) => m.status === "HEALTHY").length;
  const overall = healthyCount === runtimeModules.length ? "READY" : healthyCount >= runtimeModules.length / 2 ? "PARTIALLY_READY" : "NOT_READY";

  const ctx: AlertEvaluationContext = {
    generatedAt,
    tradingDate,
    userId,
    instruments: ["NIFTY", "BANKNIFTY"],
    decision: {
      available: !!decision,
      action: decision?.decision.action ?? null,
      bias: biasFromAction(decision?.decision.action),
      freshness: decisionFreshness,
    },
    pcr: {
      available: pcrDirection != null,
      direction: pcrDirection,
      bias: pcrBias,
      freshness: decisionFreshness,
    },
    gti: {
      available: !!gti,
      state: gti?.gti.state ?? null,
      bias: normaliseState(gti?.gti.state),
      freshness: gtiFreshness,
    },
    breadth: {
      available: !!gti,
      state: gti?.breadthState ?? null,
      bias: normaliseState(gti?.breadthState),
      freshness: gtiFreshness,
    },
    vix: {
      available: vixValue != null,
      value: vixValue,
      regime: vixToRegime(vixValue),
      freshness: vixValue != null ? "LIVE" : "UNKNOWN",
    },
    astro: {
      available: false,
      state: "NONE",
      label: null,
      startsInMinutes: null,
      freshness: "UNKNOWN",
    },
    gannLevels: [],
    gannGap: {
      available: !!gap,
      predictionId: gap ? `gg-${gap.tradingDate}-${gap.formulaVersion}-${gap.configVersion}` : null,
      lifecycle: gapLifecycle(gap?.lifecycle),
      label: gap?.label ?? null,
      freshness: gapFreshness,
    },
    strategy: {
      available: !!terminal && terminal.engine.recommended.length > 0,
      topStrategyId: terminal?.engine.recommended[0]?.profile.key ?? null,
      bias: strategyBiasToCanonical(terminal?.engine.recommended[0]?.profile.bias),
      freshness: terminal ? "MIXED" : "UNKNOWN",
    },
    ai: {
      available: !!ai,
      bias: assistantBiasToCanonical(ai?.response.marketBias),
      confidence: ai?.response.confidence ?? null,
      freshness: ai ? "MIXED" : "UNKNOWN",
    },
    runtime: {
      available: true,
      modules: runtimeModules,
      overall,
    },
  };
  return ctx;
}

// ─────────────────────────────────────────────────────────────
// Subscription CRUD
// ─────────────────────────────────────────────────────────────

export const getSmartAlertSubscription = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PersistedSubscriptionRow> => {
    const { data, error } = await context.supabase
      .from("smart_alert_subscriptions")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return mapSubscriptionRow(context.userId, (data as Record<string, unknown> | null) ?? null);
  });

export interface SubscriptionUpdate {
  readonly types?: Partial<Record<AlertType, boolean>>;
  readonly instruments?: readonly string[];
  readonly minimumPriority?: AlertPriority;
  readonly inAppEnabled?: boolean;
  readonly emailEnabled?: boolean;
  readonly telegramEnabled?: boolean;
  readonly webhookEnabled?: boolean;
  readonly quietHours?: { readonly start: string; readonly end: string } | null;
  readonly cooldownOverrideSec?: number | null;
  readonly timezone?: string;
}

export const updateSmartAlertSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: SubscriptionUpdate) => d ?? {})
  .handler(async ({ context, data }): Promise<PersistedSubscriptionRow> => {
    const current = await getSmartAlertSubscription();
    const nextTypes: Record<AlertType, boolean> = { ...current.types };
    if (data.types) {
      for (const [k, v] of Object.entries(data.types)) nextTypes[k as AlertType] = !!v;
    }
    const row = {
      user_id: context.userId,
      types: nextTypes,
      instruments: data.instruments ?? current.instruments,
      minimum_priority: data.minimumPriority ?? current.minimumPriority,
      in_app_enabled: data.inAppEnabled ?? current.inAppEnabled,
      email_enabled: data.emailEnabled ?? current.emailEnabled,
      telegram_enabled: data.telegramEnabled ?? current.telegramEnabled,
      webhook_enabled: data.webhookEnabled ?? current.webhookEnabled,
      quiet_hours: data.quietHours === undefined ? current.quietHours : data.quietHours,
      cooldown_override_sec: data.cooldownOverrideSec === undefined ? current.cooldownOverrideSec : data.cooldownOverrideSec,
      timezone: data.timezone ?? current.timezone,
    };
    const { data: up, error } = await context.supabase
      .from("smart_alert_subscriptions")
      .upsert(row as never, { onConflict: "user_id" })
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return mapSubscriptionRow(context.userId, (up as Record<string, unknown> | null) ?? null);
  });

// ─────────────────────────────────────────────────────────────
// Event feed
// ─────────────────────────────────────────────────────────────

export const getSmartAlertEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { limit?: number; unreadOnly?: boolean } | undefined) => ({
    limit: Math.max(1, Math.min(200, d?.limit ?? 50)),
    unreadOnly: !!d?.unreadOnly,
  }))
  .handler(async ({ context, data }): Promise<PersistedAlertEventRow[]> => {
    let q = context.supabase
      .from("smart_alert_events")
      .select("*")
      .eq("user_id", context.userId)
      .order("generated_at", { ascending: false })
      .limit(data.limit);
    if (data.unreadOnly) q = q.is("read_at", null).is("dismissed_at", null);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return ((rows as Record<string, unknown>[] | null) ?? []).map(mapEventRow);
  });

export const getSmartAlertUnreadCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ count: number }> => {
    const { count, error } = await context.supabase
      .from("smart_alert_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .is("read_at", null)
      .is("dismissed_at", null);
    if (error) throw new Error(error.message);
    return { count: count ?? 0 };
  });

export const markSmartAlertRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("smart_alert_events")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markSmartAlertDismissed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const now = new Date().toISOString();
    const { error } = await context.supabase
      .from("smart_alert_events")
      .update({ dismissed_at: now, read_at: now })
      .eq("user_id", context.userId)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markAllSmartAlertsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("smart_alert_events")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .is("read_at", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────
// Engine run
// ─────────────────────────────────────────────────────────────

export interface SmartAlertRunResult {
  readonly emittedIds: readonly string[];
  readonly emittedCount: number;
  readonly suppressedCount: number;
  readonly diagnostics: EngineDiagnostics;
  readonly generatedAt: string;
  readonly runtimeOverall: string;
  readonly disclaimer: string;
}

export const runSmartAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SmartAlertRunResult> => {
    const userId = context.userId;

    // Load checkpoint + subscription in parallel.
    const [cpRow, subRow] = await Promise.all([
      context.supabase
        .from("smart_alert_engine_checkpoints")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle(),
      context.supabase
        .from("smart_alert_subscriptions")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
    const checkpoint = mapCheckpointRow(userId, (cpRow.data as Record<string, unknown> | null) ?? null).checkpoint;
    const subscription = mapSubscriptionRow(userId, (subRow.data as Record<string, unknown> | null) ?? null);

    let ctx: AlertEvaluationContext;
    try {
      ctx = await buildEvaluationContext(userId);
    } catch (err) {
      await context.supabase
        .from("smart_alert_engine_checkpoints")
        .upsert(
          {
            user_id: userId,
            last_evaluated_at: new Date().toISOString(),
            last_error: String((err as Error)?.message ?? err),
            rules_version: SMART_ALERTS_RULES_VERSION,
          } as never,
          { onConflict: "user_id" },
        );
      throw err;
    }

    const out = runAlertEngine({ context: ctx, checkpoint, subscription });

    // Persist events (idempotent via unique fingerprint).
    const emittedIds: string[] = [];
    for (const ev of out.emitted) {
      const insertRow = {
        user_id: userId,
        fingerprint: ev.fingerprint,
        type: ev.type,
        priority: ev.priority,
        title: ev.title,
        summary: ev.summary,
        instrument: ev.instrument,
        source_modules: ev.sourceModules as unknown as never,
        generated_at: ev.createdAt,
        trading_date: ev.tradingDate,
        rules_version: ev.rulesVersion,
        payload: ev as unknown as never,
      };
      const { data: ins } = await context.supabase
        .from("smart_alert_events")
        .upsert(insertRow as never, { onConflict: "user_id,fingerprint,trading_date" })
        .select("id")
        .maybeSingle();
      const insertedId = (ins as { id?: string } | null)?.id;
      if (insertedId) emittedIds.push(insertedId);

      // Delivery attempts (audit trail, no PII).
      for (const att of ev.deliveryStatus) {
        await context.supabase.from("smart_alert_delivery_attempts").insert({
          user_id: userId,
          event_id: insertedId ?? null,
          fingerprint: ev.fingerprint,
          provider: att.provider,
          status: att.status,
          error_code: att.errorCode,
          retryable: att.retryable,
          attempted_at: att.attemptedAt,
        } as never);
      }
    }

    // Persist checkpoint.
    await context.supabase
      .from("smart_alert_engine_checkpoints")
      .upsert(
        {
          user_id: userId,
          last_evaluated_at: ctx.generatedAt,
          last_success_at: ctx.generatedAt,
          last_error: null,
          rules_version: SMART_ALERTS_RULES_VERSION,
          previous: out.nextCheckpoint.previous as unknown as never,
          fingerprints: {
            lastFingerprintsByType: out.nextCheckpoint.lastFingerprintsByType,
            lastEmittedAtByFingerprint: out.nextCheckpoint.lastEmittedAtByFingerprint,
            emittedFingerprintsThisSession: out.nextCheckpoint.emittedFingerprintsThisSession,
          } as unknown as never,
        } as never,
        { onConflict: "user_id" },
      );

    return {
      emittedIds,
      emittedCount: out.emitted.length,
      suppressedCount: out.suppressed.length,
      diagnostics: out.diagnostics,
      generatedAt: ctx.generatedAt,
      runtimeOverall: ctx.runtime.overall,
      disclaimer: ALERT_DISCLAIMER,
    };
  });

// ─────────────────────────────────────────────────────────────
// Admin diagnostics: recent runs
// ─────────────────────────────────────────────────────────────

export interface AdminAlertDiagnostics {
  readonly totalEvents: number;
  readonly unreadEvents: number;
  readonly last24hCount: number;
  readonly rulesVersion: string;
  readonly disclaimer: string;
}

async function assertAdmin(ctx: { supabase: unknown; userId: string }): Promise<void> {
  const s = ctx.supabase as { rpc: (fn: string, p: Record<string, unknown>) => Promise<{ data: unknown }> };
  const { data } = await s.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("forbidden");
}

export const getAdminAlertDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminAlertDiagnostics> => {
    await assertAdmin(context);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [{ count: total }, { count: unread }, { count: recent }] = await Promise.all([
      context.supabase.from("smart_alert_events").select("id", { count: "exact", head: true }),
      context.supabase.from("smart_alert_events").select("id", { count: "exact", head: true }).is("read_at", null),
      context.supabase.from("smart_alert_events").select("id", { count: "exact", head: true }).gte("generated_at", since),
    ]);
    return {
      totalEvents: total ?? 0,
      unreadEvents: unread ?? 0,
      last24hCount: recent ?? 0,
      rulesVersion: SMART_ALERTS_RULES_VERSION,
      disclaimer: ALERT_DISCLAIMER,
    };
  });