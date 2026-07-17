// Phase 3C — Subscription defaults and matching. Pure.

import type { AlertSubscription, AlertType } from "./types";

const ALL_TYPES: readonly AlertType[] = [
  "DECISION_CHANGED",
  "GTI_DIRECTION_CHANGED",
  "PCR_REGIME_CHANGED",
  "BREADTH_REVERSAL",
  "VIX_REGIME_CHANGED",
  "GANN_LEVEL_APPROACHING",
  "GANN_LEVEL_TOUCHED",
  "ASTRO_WINDOW_STARTING",
  "ASTRO_WINDOW_ACTIVE",
  "GANN_GAP_PREDICTION_FROZEN",
  "GANN_GAP_OUTCOME_AVAILABLE",
  "OPTION_STRATEGY_CHANGED",
  "AI_MARKET_BIAS_CHANGED",
  "RUNTIME_MODULE_DEGRADED",
  "RUNTIME_MODULE_RECOVERED",
  "DATA_STALE",
  "DATA_RECOVERED",
];

export function allAlertTypes(): readonly AlertType[] {
  return ALL_TYPES;
}

export function defaultSubscription(userId: string): AlertSubscription {
  const types = Object.fromEntries(ALL_TYPES.map((t) => [t, true])) as Record<AlertType, boolean>;
  return {
    userId,
    types,
    instruments: [],
    minimumPriority: "LOW",
    inAppEnabled: true,
    emailEnabled: false,
    telegramEnabled: false,
    webhookEnabled: false,
    quietHours: null,
    cooldownOverrideSec: null,
    timezone: "Asia/Kolkata",
  };
}

export function subscriptionMatches(
  sub: AlertSubscription | null,
  type: AlertType,
  instrument: string | null,
): { ok: true } | { ok: false; reason: "SUBSCRIPTION_DISABLED" } {
  if (!sub) return { ok: true };
  if (!sub.types[type]) return { ok: false, reason: "SUBSCRIPTION_DISABLED" };
  if (sub.instruments.length > 0 && instrument != null && !sub.instruments.includes(instrument)) {
    return { ok: false, reason: "SUBSCRIPTION_DISABLED" };
  }
  return { ok: true };
}