// Phase 3C-2 — Smart Alert Engine persistence + runner (server functions).
//
// Pure orchestration on top of the deterministic engine in `./engine`.
// Every read is RLS-scoped to the caller; writes stay within the caller's
// user_id (the RLS policies enforce this at the database level). No broker
// touches. No formula math. No trade execution.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth, assertAuth } from "@/integrations/supabase/auth-middleware";
import { GUEST_USER_ID } from "@/lib/guest-session";
import { recordDeliveryAttempt, persistOperatorDelivery } from "@/lib/notifications/alert-delivery.functions";

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
    try {
      return JSON.parse(v) as T;
    } catch {
      return fallback;
    }
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

function mapSubscriptionRow(
  userId: string,
  r: Record<string, unknown> | null,
): PersistedSubscriptionRow {
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
    minimumPriority: String(r.minimum_priority ?? "LOW") as AlertPriority,
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

function mapCheckpointRow(
  userId: string,
  r: Record<string, unknown> | null,
): PersistedCheckpointRow {
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

function gapLifecycle(
  l: string | null | undefined,
): "PENDING" | "PROVISIONAL" | "FROZEN" | "OUTCOME" {
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
    pcrDirection === "CE"
      ? "BULLISH"
      : pcrDirection === "PE"
        ? "BEARISH"
        : pcrDirection === "NEUTRAL"
          ? "NEUTRAL"
          : "UNKNOWN";

  const vixValue = decision?.context.vix ?? gti?.vix.value ?? null;

  const runtimeModules: RuntimeModuleView[] = [
    {
      module: "DECISION_ENGINE",
      status: decision ? "HEALTHY" : "UNAVAILABLE",
      reason: decision ? null : "unavailable",
    },
    { module: "GTI", status: gti ? "HEALTHY" : "UNAVAILABLE", reason: gti ? null : "unavailable" },
    {
      module: "COMBINED_PCR",
      status: pcrDirection ? "HEALTHY" : "DEGRADED",
      reason: pcrDirection ? null : "PCR direction unavailable",
    },
    {
      module: "MARKET_BREADTH",
      status: gti ? "HEALTHY" : "UNAVAILABLE",
      reason: gti ? null : "breadth unavailable",
    },
    {
      module: "INDIA_VIX",
      status: vixValue != null ? "HEALTHY" : "UNAVAILABLE",
      reason: vixValue == null ? "VIX unavailable" : null,
    },
    {
      module: "GANN_GAP_OUTLOOK",
      status: gap ? "HEALTHY" : "UNAVAILABLE",
      reason: gap ? null : "outlook unavailable",
    },
    {
      module: "OPTION_STRATEGY_TERMINAL",
      status: terminal ? "HEALTHY" : "UNAVAILABLE",
      reason: terminal ? null : "terminal unavailable",
    },
    {
      module: "AI_MARKET_ASSISTANT",
      status: ai ? "HEALTHY" : "UNAVAILABLE",
      reason: ai ? null : "assistant unavailable",
    },
  ];
  const healthyCount = runtimeModules.filter((m) => m.status === "HEALTHY").length;
  const overall =
    healthyCount === runtimeModules.length
      ? "READY"
      : healthyCount >= runtimeModules.length / 2
        ? "PARTIALLY_READY"
        : "NOT_READY";

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
// Active In-Memory / Runtime Alerts Generator
// ─────────────────────────────────────────────────────────────

const runtimeAlertFeeds = new Map<string, { rows: PersistedAlertEventRow[]; checkpoint: AlertCheckpoint }>();
const runtimeSubscriptions = new Map<string, PersistedSubscriptionRow>();

function runtimeFeed(userId: string) {
  const day = new Date().toISOString().slice(0, 10);
  let feed = runtimeAlertFeeds.get(userId);
  if (!feed || feed.checkpoint.updatedAt.slice(0, 10) !== day) {
    feed = { rows: [], checkpoint: makeEmptyCheckpoint(userId, new Date().toISOString()) };
    runtimeAlertFeeds.set(userId, feed);
    if (runtimeAlertFeeds.size > 100) runtimeAlertFeeds.delete(runtimeAlertFeeds.keys().next().value!);
  }
  return feed;
}

function rememberEvaluatedAlerts(userId: string, events: readonly AlertEvent[], checkpoint: AlertCheckpoint) {
  const feed = runtimeFeed(userId);
  const rows = events.map((event): PersistedAlertEventRow => ({
    id: event.id || event.fingerprint, fingerprint: event.fingerprint, type: event.type,
    priority: event.priority, title: event.title, summary: event.summary, instrument: event.instrument,
    tradingDate: event.tradingDate, generatedAt: event.createdAt, readAt: null, dismissedAt: null,
    rulesVersion: event.rulesVersion, sourceModules: event.sourceModules, payload: event,
  }));
  const merged = new Map(feed.rows.map((row) => [row.fingerprint, row]));
  for (const row of rows) merged.set(row.fingerprint, row);
  feed.rows = [...merged.values()].sort((a, b) => b.generatedAt.localeCompare(a.generatedAt)).slice(0, 200);
  feed.checkpoint = checkpoint;
}

export async function generateRuntimeAlertRows(userId: string): Promise<PersistedAlertEventRow[]> {
  const feed = runtimeFeed(userId);
  if (feed.rows.length) return feed.rows;
  try {
    const context = await buildEvaluationContext(userId);
    // Reading a fallback feed never dispatches external notifications.
    const result = await runAlertEngine({ context, checkpoint: feed.checkpoint,
      subscription: defaultSubscription(userId), providers: [] });
    rememberEvaluatedAlerts(userId, result.emitted, result.nextCheckpoint);
  } catch {
    // No fabricated market signals when canonical evaluation is unavailable.
  }
  return feed.rows;
}

// ─────────────────────────────────────────────────────────────
// Subscription CRUD
// ─────────────────────────────────────────────────────────────

export const getSmartAlertSubscription = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PersistedSubscriptionRow> => {
    assertAuth(context);
    const local = runtimeSubscriptions.get(context.userId);
    if (local && (context.userId === GUEST_USER_ID || context.isGuest)) return local;
    try {
      const { data, error } = await context.supabase
        .from("smart_alert_subscriptions")
        .select("*")
        .eq("user_id", context.userId)
        .maybeSingle();
      if (error) {
        if (
          context.userId === GUEST_USER_ID ||
          (context as { isGuest?: boolean }).isGuest ||
          error.code === "42501" ||
          error.message?.includes("permission denied")
        ) {
          return mapSubscriptionRow(context.userId, null);
        }
        throw new Error(error.message);
      }
      return mapSubscriptionRow(context.userId, (data as Record<string, unknown> | null) ?? null);
    } catch (err) {
      if (
        context.userId === GUEST_USER_ID ||
        (context as { isGuest?: boolean }).isGuest ||
        (err as Error)?.message?.includes("permission denied")
      ) {
        return mapSubscriptionRow(context.userId, null);
      }
      throw err;
    }
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
    assertAuth(context);
    let current: PersistedSubscriptionRow;
    try {
      current = await getSmartAlertSubscription();
    } catch {
      current = mapSubscriptionRow(context.userId, null);
    }
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
      cooldown_override_sec:
        data.cooldownOverrideSec === undefined
          ? current.cooldownOverrideSec
          : data.cooldownOverrideSec,
      timezone: data.timezone ?? current.timezone,
    };
    if (context.userId === GUEST_USER_ID || context.isGuest) {
      runtimeSubscriptions.set(context.userId, mapSubscriptionRow(context.userId, row));
    }
    try {
      const { data: up, error } = await context.supabase
        .from("smart_alert_subscriptions")
        .upsert(row as never, { onConflict: "user_id" })
        .select("*")
        .maybeSingle();
      if (error) {
        if (
          context.userId === GUEST_USER_ID ||
          (context as { isGuest?: boolean }).isGuest ||
          error.code === "42501" ||
          error.message?.includes("permission denied")
        ) {
          return mapSubscriptionRow(context.userId, row as unknown as Record<string, unknown>);
        }
        throw new Error(error.message);
      }
      return mapSubscriptionRow(context.userId, (up as Record<string, unknown> | null) ?? null);
    } catch (err) {
      if (
        context.userId === GUEST_USER_ID ||
        (context as { isGuest?: boolean }).isGuest ||
        (err as Error)?.message?.includes("permission denied")
      ) {
        return mapSubscriptionRow(context.userId, row as unknown as Record<string, unknown>);
      }
      throw err;
    }
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
    assertAuth(context);
    try {
      let q = context.supabase
        .from("smart_alert_events")
        .select("*")
        .eq("user_id", context.userId)
        .order("generated_at", { ascending: false })
        .limit(data.limit);
      if (data.unreadOnly) q = q.is("read_at", null).is("dismissed_at", null);
      const { data: rows, error } = await q;
      if (error) throw new Error("SMART_ALERT_FEED_READ_FAILED");
      const mapped = ((rows as Record<string, unknown>[] | null) ?? []).map(mapEventRow);
      const evaluated = runtimeFeed(context.userId).rows;
      const merged = new Map(evaluated.map((row) => [row.fingerprint, row]));
      for (const row of mapped) merged.set(row.fingerprint, row);
      if (!merged.size) for (const row of await generateRuntimeAlertRows(context.userId)) merged.set(row.fingerprint, row);
      return [...merged.values()].filter((row) => !data.unreadOnly || (!row.readAt && !row.dismissedAt))
        .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt)).slice(0, data.limit);
    } catch {
      return (await generateRuntimeAlertRows(context.userId))
        .filter((row) => !data.unreadOnly || (!row.readAt && !row.dismissedAt)).slice(0, data.limit);
    }
  });

export const getSmartAlertUnreadCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ count: number }> => {
    assertAuth(context);
    try {
      const { count, error } = await context.supabase
        .from("smart_alert_events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", context.userId)
        .is("read_at", null)
        .is("dismissed_at", null);
      if (error) {
        if (
          context.userId === GUEST_USER_ID ||
          (context as { isGuest?: boolean }).isGuest ||
          error.code === "42501"
        ) {
          return { count: (await generateRuntimeAlertRows(context.userId)).filter((row) => !row.readAt && !row.dismissedAt).length };
        }
        throw new Error(error.message);
      }
      return { count: count ?? 0 };
    } catch (err) {
      if (
        context.userId === GUEST_USER_ID ||
        (context as { isGuest?: boolean }).isGuest ||
        (err as Error)?.message?.includes("permission denied")
      ) {
        return { count: (await generateRuntimeAlertRows(context.userId)).filter((row) => !row.readAt && !row.dismissedAt).length };
      }
      throw err;
    }
  });

export const markSmartAlertRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    assertAuth(context);
    const feed = runtimeFeed(context.userId);
    feed.rows = feed.rows.map((row) => row.id === data.id ? { ...row, readAt: new Date().toISOString() } : row);
    try {
      const { error } = await context.supabase
        .from("smart_alert_events")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", context.userId)
        .eq("id", data.id);
      if (
        error &&
        context.userId !== GUEST_USER_ID &&
        !(context as { isGuest?: boolean }).isGuest &&
        error.code !== "42501"
      ) {
        throw new Error(error.message);
      }
    } catch (err) {
      if (
        context.userId !== GUEST_USER_ID &&
        !(context as { isGuest?: boolean }).isGuest
      ) {
        throw err;
      }
    }
    return { ok: true };
  });

export const markSmartAlertDismissed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    assertAuth(context);
    const now = new Date().toISOString();
    const feed = runtimeFeed(context.userId);
    feed.rows = feed.rows.map((row) => row.id === data.id ? { ...row, dismissedAt: now, readAt: now } : row);
    try {
      const { error } = await context.supabase
        .from("smart_alert_events")
        .update({ dismissed_at: now, read_at: now })
        .eq("user_id", context.userId)
        .eq("id", data.id);
      if (
        error &&
        context.userId !== GUEST_USER_ID &&
        !(context as { isGuest?: boolean }).isGuest &&
        error.code !== "42501"
      ) {
        throw new Error(error.message);
      }
    } catch (err) {
      if (
        context.userId !== GUEST_USER_ID &&
        !(context as { isGuest?: boolean }).isGuest
      ) {
        throw err;
      }
    }
    return { ok: true };
  });

export const markAllSmartAlertsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    assertAuth(context);
    const feed = runtimeFeed(context.userId);
    feed.rows = feed.rows.map((row) => ({ ...row, readAt: row.readAt ?? new Date().toISOString() }));
    try {
      const { error } = await context.supabase
        .from("smart_alert_events")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", context.userId)
        .is("read_at", null);
      if (
        error &&
        context.userId !== GUEST_USER_ID &&
        !(context as { isGuest?: boolean }).isGuest &&
        error.code !== "42501"
      ) {
        throw new Error(error.message);
      }
    } catch (err) {
      if (
        context.userId !== GUEST_USER_ID &&
        !(context as { isGuest?: boolean }).isGuest
      ) {
        throw err;
      }
    }
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
  readonly persistenceFailed: boolean;
  readonly persistenceError: string | null;
}

export const runSmartAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d?: { telegramEnabled?: boolean }) => d ?? {})
  .handler(async ({ context, data }): Promise<SmartAlertRunResult> => {
    assertAuth(context);
    if (!context.supabase) throw new Error("Unauthorized: Authentication required");
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
    const isGuest = userId === GUEST_USER_ID || (context as { isGuest?: boolean }).isGuest;
    // Failed reads must not reset dedupe state or substitute default preferences for registered users.
    if (cpRow.error && !isGuest && (cpRow.error as { code?: string })?.code !== "42501") {
      throw new Error("SMART_ALERT_CHECKPOINT_READ_FAILED");
    }
    if (subRow.error && !isGuest && (subRow.error as { code?: string })?.code !== "42501") {
      throw new Error("SMART_ALERT_SUBSCRIPTION_READ_FAILED");
    }
    const checkpoint = cpRow.error || isGuest ? runtimeFeed(userId).checkpoint : mapCheckpointRow(
      userId,
      (cpRow.data as Record<string, unknown> | null) ?? null,
    ).checkpoint;
    const subscription = runtimeSubscriptions.get(userId) ?? mapSubscriptionRow(
      userId,
      (subRow.data as Record<string, unknown> | null) ?? null,
    );

    // Apply explicit telegramEnabled override or default true
    const effectiveSubscription: AlertSubscription = {
      ...subscription,
      telegramEnabled:
        data?.telegramEnabled !== undefined
          ? data.telegramEnabled
          : subscription.telegramEnabled,
    };

    let ctx: AlertEvaluationContext;
    try {
      ctx = await buildEvaluationContext(userId);
    } catch (err) {
      await context.supabase.from("smart_alert_engine_checkpoints").upsert(
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

    const out = await runAlertEngine({ context: ctx, checkpoint, subscription: effectiveSubscription });
    rememberEvaluatedAlerts(userId, out.emitted, out.nextCheckpoint);

    // Persist events (idempotent via unique (user_id, fingerprint) constraint).
    // Track event failures without advancing the checkpoint. The unique key
    // prevents duplicate event rows, but delivery has already happened; a
    // subsequent evaluation can resend Telegram after a failed event write.
    const emittedIds: string[] = [];
    let persistenceFailed = false;
    let eventPersistenceFailed = false;
    let persistenceError: string | null = null;
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
      const { data: ins, error: insErr } = await context.supabase
        .from("smart_alert_events")
        .upsert(insertRow as never, { onConflict: "user_id,fingerprint" })
        .select("id")
        .maybeSingle();
      if (insErr) {
        if (!isGuest && (insErr as { code?: string })?.code !== "42501") {
          persistenceFailed = true;
          eventPersistenceFailed = true;
          persistenceError = "SMART_ALERT_EVENT_WRITE_FAILED";
          continue;
        }
      }
      const insertedId =
        (ins as { id?: string } | null)?.id ??
        (isGuest || (insErr as { code?: string })?.code === "42501" ? (ev.id || ev.fingerprint) : null);
      if (!insertedId) {
        persistenceFailed = true;
        eventPersistenceFailed = true;
        persistenceError = "SMART_ALERT_EVENT_ID_MISSING";
        continue;
      }
      if (insertedId) emittedIds.push(insertedId);

      // Delivery attempts (audit trail, no PII).
      for (const att of ev.deliveryStatus) {
        const { error: attemptError } = await context.supabase
          .from("smart_alert_delivery_attempts")
          .insert({
            user_id: userId,
            event_id: insertedId ?? null,
            fingerprint: ev.fingerprint,
            provider: att.provider,
            status: att.status,
            error_code: att.errorCode,
            retryable: att.retryable,
            attempted_at: att.attemptedAt,
          } as never);
        if (attemptError) {
          const code = (attemptError as { code?: string })?.code;
          const msg = (attemptError as { message?: string })?.message ?? "";
          const isBenignDbIssue =
            code === "42501" ||
            code === "42P01" ||
            code === "23503" ||
            code === "22P02" ||
            msg.toLowerCase().includes("relation") ||
            msg.toLowerCase().includes("does not exist") ||
            msg.toLowerCase().includes("foreign key") ||
            msg.toLowerCase().includes("invalid input syntax for type uuid");
          if (!isGuest && !isBenignDbIssue) {
            persistenceFailed = true;
            persistenceError = "SMART_ALERT_DELIVERY_AUDIT_WRITE_FAILED";
          }
        }
      }
    }

    // Only advance the checkpoint after every event persisted successfully.
    // A failed insert must leave the previous checkpoint intact so that
    // the next run retries emission. This does not guarantee delivery dedupe.
    if (eventPersistenceFailed) {
      const { error: checkpointError } = await context.supabase
        .from("smart_alert_engine_checkpoints")
        .upsert(
          {
            user_id: userId,
            last_evaluated_at: ctx.generatedAt,
            last_error: persistenceError,
            rules_version: SMART_ALERTS_RULES_VERSION,
          } as never,
          { onConflict: "user_id" },
        );
      if (checkpointError) {
        if (!isGuest && (checkpointError as { code?: string })?.code !== "42501") {
          persistenceError = "SMART_ALERT_CHECKPOINT_WRITE_FAILED";
        }
      }
    } else {
      // An audit-only failure must not cause already-sent messages to be resent.
      const { error: checkpointError } = await context.supabase
        .from("smart_alert_engine_checkpoints")
        .upsert(
          {
            user_id: userId,
            last_evaluated_at: ctx.generatedAt,
            ...(persistenceFailed ? {} : { last_success_at: ctx.generatedAt }),
            last_error: persistenceError,
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
      if (checkpointError) {
        if (!isGuest && (checkpointError as { code?: string })?.code !== "42501") {
          persistenceFailed = true;
          persistenceError = "SMART_ALERT_CHECKPOINT_WRITE_FAILED";
        }
      }
    }

    return {
      emittedIds,
      emittedCount: out.emitted.length,
      suppressedCount: out.suppressed.length,
      diagnostics: out.diagnostics,
      generatedAt: ctx.generatedAt,
      runtimeOverall: ctx.runtime.overall,
      disclaimer: ALERT_DISCLAIMER,
      persistenceFailed,
      persistenceError,
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
  readonly activeSubscriptions: number;
  readonly checkpointCount: number;
  readonly deliveryAttempts: number;
  readonly deliveryFailures: number;
  readonly ruleCount: number;
  readonly alertTypeCount: number;
  readonly externalAdaptersDisabledByConfiguration: boolean;
  readonly engineStatus: "HEALTHY" | "DEGRADED" | "UNAVAILABLE";
  readonly engineReason: string;
  readonly engineWarnings: readonly string[];
  readonly engineBlockers: readonly string[];
  readonly lastEvaluationAt: string | null;
  readonly lastSuccessfulEvaluationAt: string | null;
  readonly lastEvaluationStatus: "OK" | "FAILED" | "UNKNOWN";
  readonly latestErrors: readonly string[];
}

async function assertAdmin(ctx: { supabase: unknown; userId: string }): Promise<void> {
  const s = ctx.supabase as {
    rpc: (fn: string, p: Record<string, unknown>) => Promise<{ data: unknown }>;
  };
  const { data } = await s.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("forbidden");
}

export const getAdminAlertDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminAlertDiagnostics> => {
    assertAuth(context);
    await assertAdmin(context);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { classifySmartAlertReadiness, unknownEngineHealth } = await import("./readiness");

    const [
      { count: total },
      { count: unread },
      { count: recent },
      { count: subs },
      { count: cps },
      { count: attempts },
      { count: failures },
      failingRows,
      lastCheckpoint,
    ] = await Promise.all([
      context.supabase.from("smart_alert_events").select("id", { count: "exact", head: true }),
      context.supabase
        .from("smart_alert_events")
        .select("id", { count: "exact", head: true })
        .is("read_at", null),
      context.supabase
        .from("smart_alert_events")
        .select("id", { count: "exact", head: true })
        .gte("generated_at", since),
      context.supabase
        .from("smart_alert_subscriptions")
        .select("user_id", { count: "exact", head: true }),
      context.supabase
        .from("smart_alert_engine_checkpoints")
        .select("user_id", { count: "exact", head: true }),
      context.supabase
        .from("smart_alert_delivery_attempts")
        .select("id", { count: "exact", head: true }),
      context.supabase
        .from("smart_alert_delivery_attempts")
        .select("id", { count: "exact", head: true })
        .in("status", ["FAILED", "RETRY"]),
      context.supabase
        .from("smart_alert_engine_checkpoints")
        .select("last_error, updated_at")
        .not("last_error", "is", null)
        .order("updated_at", { ascending: false })
        .limit(5),
      context.supabase
        .from("smart_alert_engine_checkpoints")
        .select("last_evaluated_at, last_success_at, last_error")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const errorRows = ((failingRows.data as { last_error?: string }[] | null) ?? [])
      .map((r) => String(r.last_error ?? ""))
      .filter((s) => s.length > 0)
      .slice(0, 5);

    const lastRow =
      (lastCheckpoint.data as {
        last_evaluated_at?: string | null;
        last_success_at?: string | null;
        last_error?: string | null;
      } | null) ?? null;

    const health = {
      ...unknownEngineHealth(),
      lastEvaluationAt: lastRow?.last_evaluated_at ?? null,
      lastSuccessfulEvaluationAt: lastRow?.last_success_at ?? null,
      lastEvaluationStatus: lastRow?.last_error
        ? ("FAILED" as const)
        : lastRow?.last_evaluated_at
          ? ("OK" as const)
          : ("UNKNOWN" as const),
      lastError: lastRow?.last_error ?? null,
      deliveryFailureRate: (attempts ?? 0) > 0 ? (failures ?? 0) / (attempts as number) : 0,
    };
    const readiness = classifySmartAlertReadiness(health);

    return {
      totalEvents: total ?? 0,
      unreadEvents: unread ?? 0,
      last24hCount: recent ?? 0,
      rulesVersion: SMART_ALERTS_RULES_VERSION,
      disclaimer: ALERT_DISCLAIMER,
      activeSubscriptions: subs ?? 0,
      checkpointCount: cps ?? 0,
      deliveryAttempts: attempts ?? 0,
      deliveryFailures: failures ?? 0,
      ruleCount: health.ruleCount,
      alertTypeCount: health.alertTypeCount,
      externalAdaptersDisabledByConfiguration: true,
      engineStatus: readiness.status,
      engineReason: readiness.reason,
      engineWarnings: readiness.warnings,
      engineBlockers: readiness.blockers,
      lastEvaluationAt: health.lastEvaluationAt,
      lastSuccessfulEvaluationAt: health.lastSuccessfulEvaluationAt,
      lastEvaluationStatus: health.lastEvaluationStatus,
      latestErrors: errorRows,
    };
  });

// ─────────────────────────────────────────────────────────────
// Operator verification: Instant Telegram ping
// ─────────────────────────────────────────────────────────────

export interface TelegramTestPingResult {
  readonly ok: boolean;
  readonly message: string;
  readonly messageId?: number;
  readonly error?: string;
}

export const sendTelegramTestPing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TelegramTestPingResult> => {
    assertAuth(context);
    const audit = async (row: Parameters<typeof recordDeliveryAttempt>[0]) => persistOperatorDelivery({
      ...row, target_channel: process.env.TELEGRAM_CHAT_ID?.trim() || null,
    }, context.userId);

    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
    if (!token || !chatId) {
      const err =
        "TELEGRAM_CREDENTIALS_MISSING: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not configured on the production server.";
      await audit({
        id: `ping-${Date.now()}`,
        event_id: null,
        fingerprint: `operator-ping-${Date.now()}`,
        provider: "TELEGRAM",
        status: "DISABLED",
        error_code: "MISSING_TELEGRAM_CREDENTIALS",
        retryable: false,
        duration_ms: 0,
        attempted_at: new Date().toISOString(),
        event: {
          title: "Operator Telegram Test Ping",
          type: "OPERATOR_PING",
          priority: "INFO",
        },
        retry_count: 0,
      });
      return { ok: false, message: err, error: err };
    }

    const nowIso = new Date().toISOString();
    const text = [
      "🔔 [EagleBABA Operator Alert Ping]",
      "",
      `Session: ${context.userId}`,
      `Timestamp: ${nowIso}`,
      "Status: Bot API & Dispatch Pipeline Online",
      "",
      "⚡ Verified from Alert Center control plane.",
      "Research only — not financial advice — no broker execution.",
    ].join("\n");

    const start = Date.now();
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          disable_web_page_preview: true,
        }),
      });

      const duration = Date.now() - start;
      const json = (await response.json()) as {
        ok?: boolean;
        description?: string;
        result?: { message_id?: number };
      };

      if (!response.ok || json.ok !== true) {
        const errorDesc = json.description || `HTTP ${response.status}`;
        await audit({
          id: `ping-${Date.now()}`,
          event_id: null,
          fingerprint: `operator-ping-${Date.now()}`,
          provider: "TELEGRAM",
          status: "FAILED",
          error_code: errorDesc,
          retryable: false,
          duration_ms: duration,
          attempted_at: nowIso,
          event: {
            title: "Operator Telegram Test Ping",
            type: "OPERATOR_PING",
            priority: "INFO",
          },
          retry_count: 0,
        });
        return {
          ok: false,
          message: `Telegram delivery rejected: ${errorDesc}`,
          error: errorDesc,
        };
      }

      const auditPersisted = await audit({
        id: `ping-${Date.now()}`,
        event_id: null,
        fingerprint: `operator-ping-${Date.now()}`,
        provider: "TELEGRAM",
        status: "DELIVERED",
        error_code: null,
        retryable: false,
        duration_ms: duration,
        attempted_at: nowIso,
        event: {
          title: "Operator Telegram Test Ping",
          type: "OPERATOR_PING",
          priority: "INFO",
        },
        retry_count: 0,
      });

      return {
        ok: true,
        message: `✓ Test ping delivered to Telegram chat (${chatId}) [msg_id: ${json.result?.message_id}]`,
        messageId: json.result?.message_id,
      };
    } catch (err) {
      const duration = Date.now() - start;
      const msg = (err as Error)?.message || "Network error sending Telegram ping";
      await audit({
        id: `ping-${Date.now()}`,
        event_id: null,
        fingerprint: `operator-ping-${Date.now()}`,
        provider: "TELEGRAM",
        status: "FAILED",
        error_code: msg,
        retryable: true,
        duration_ms: duration,
        attempted_at: nowIso,
        event: {
          title: "Operator Telegram Test Ping",
          type: "OPERATOR_PING",
          priority: "INFO",
        },
        retry_count: 0,
      });
      return { ok: false, message: `Failed to dispatch ping: ${msg}`, error: msg };
    }
  });

export const dispatchVolumeProfileAlert = createServerFn({ method: "POST" })
  .inputValidator((signal: any) => signal)
  .handler(async ({ data }) => {
    try {
      const { sendVolumeProfileTelegramAlert } = await import("./telegram-delivery.server");
      const res = await sendVolumeProfileTelegramAlert(data);
      return { ok: res.status === "DELIVERED", status: res.status, errorCode: res.errorCode };
    } catch (err) {
      return { ok: false, status: "FAILED", errorCode: (err as Error)?.message || "Unknown error" };
    }
  });

export const dispatchVWAPAlert = createServerFn({ method: "POST" })
  .inputValidator((signal: any) => signal)
  .handler(async ({ data }) => {
    try {
      const { sendVWAPTelegramAlert } = await import("./telegram-delivery.server");
      const res = await sendVWAPTelegramAlert(data);
      return { ok: res.status === "DELIVERED", status: res.status, errorCode: res.errorCode };
    } catch (err) {
      return { ok: false, status: "FAILED", errorCode: (err as Error)?.message || "Unknown error" };
    }
  });
