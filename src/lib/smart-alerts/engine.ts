// Phase 3C — Pure Smart Alert engine runner. Deterministic.
//
// Reads canonical context + prior checkpoint, generates candidate events,
// then applies suppression (subscription filter, priority floor,
// duplicate fingerprint, cooldown, quiet hours) and returns emitted +
// suppressed events plus an updated checkpoint. No I/O.

import { deliverEvent, DEFAULT_DELIVERY_PROVIDERS, type AlertDeliveryProvider } from "./delivery";
import {
  effectiveCooldownSec,
  isDuplicate,
  isInCooldown,
  isInQuietHours,
  isInSameSession,
} from "./dedupe";
import { generateAlertEvents, type PriorSnapshot } from "./events";
import { meetsMinimumPriority } from "./priority";
import { DEFAULT_RULE_CONFIG, type AlertRuleConfig } from "./rules";
import { subscriptionMatches } from "./subscriptions";
import type {
  AlertCheckpoint,
  AlertEngineResult,
  AlertEvaluationContext,
  AlertEvent,
  AlertSubscription,
  AlertSuppression,
} from "./types";

export interface RunAlertsInput {
  readonly context: AlertEvaluationContext;
  readonly checkpoint: AlertCheckpoint;
  readonly subscription: AlertSubscription | null;
  readonly config?: AlertRuleConfig;
  readonly providers?: readonly AlertDeliveryProvider[];
}

export function runAlertEngine(input: RunAlertsInput): AlertEngineResult {
  const cfg = input.config ?? DEFAULT_RULE_CONFIG;
  const ctx = input.context;
  const cp = input.checkpoint;
  const sub = input.subscription;
  const providers = input.providers ?? DEFAULT_DELIVERY_PROVIDERS;

  const prior: PriorSnapshot = cp.canonicalState ?? {};
  const candidates = generateAlertEvents(ctx, prior, cfg);

  const emitted: AlertEvent[] = [];
  const suppressed: AlertSuppression[] = [];
  const seenFingerprints = new Set<string>(cp.emittedFingerprints);
  const cooldowns: Record<string, string> = { ...cp.lastEmittedAt };
  const cooldownSec = effectiveCooldownSec(sub?.cooldownOverrideSec ?? null);

  for (const evt of candidates) {
    // 1) Subscription filter
    const subCheck = subscriptionMatches(sub, evt.type, evt.instrument ?? null, evt.priority);
    if (!subCheck.ok) {
      suppressed.push({ fingerprint: evt.fingerprint, type: evt.type, reason: subCheck.reason });
      continue;
    }
    // 2) Priority floor
    if (!meetsMinimumPriority(evt.priority, sub?.minimumPriority)) {
      suppressed.push({ fingerprint: evt.fingerprint, type: evt.type, reason: "MIN_PRIORITY" });
      continue;
    }
    // 3) Duplicate fingerprint (session-level idempotency)
    if (isDuplicate(evt.fingerprint, seenFingerprints)) {
      suppressed.push({ fingerprint: evt.fingerprint, type: evt.type, reason: "DUPLICATE_FINGERPRINT" });
      continue;
    }
    // 4) Cooldown
    const lastAt = cooldowns[evt.type] ?? null;
    if (isInCooldown(lastAt, ctx.generatedAt, cooldownSec)) {
      suppressed.push({ fingerprint: evt.fingerprint, type: evt.type, reason: "COOLDOWN" });
      continue;
    }
    // 5) Same-session suppression for the same canonicalEntity
    if (
      evt.canonicalEntity &&
      isInSameSession(evt.canonicalEntity, ctx.tradingDate, cp.sessionEntities)
    ) {
      suppressed.push({ fingerprint: evt.fingerprint, type: evt.type, reason: "SAME_SESSION" });
      continue;
    }
    // 6) Quiet hours (skip only INFO/LOW; keep HIGH/CRITICAL)
    if (
      (evt.priority === "INFO" || evt.priority === "LOW") &&
      isInQuietHours(sub?.quietHours ?? null, ctx.generatedAt, sub?.timezone ?? "Asia/Kolkata")
    ) {
      suppressed.push({ fingerprint: evt.fingerprint, type: evt.type, reason: "QUIET_HOURS" });
      continue;
    }

    // Deliver
    const attempts = deliverEvent(evt, sub, ctx.generatedAt, providers);
    emitted.push({ ...evt, deliveryStatus: attempts });
    seenFingerprints.add(evt.fingerprint);
    cooldowns[evt.type] = ctx.generatedAt;
  }

  const nextSessionEntities: Record<string, string> = { ...cp.sessionEntities };
  for (const evt of emitted) {
    if (evt.canonicalEntity) nextSessionEntities[evt.canonicalEntity] = ctx.tradingDate;
  }

  const nextCheckpoint: AlertCheckpoint = {
    userId: ctx.userId,
    tradingDate: ctx.tradingDate,
    updatedAt: ctx.generatedAt,
    emittedFingerprints: Array.from(seenFingerprints),
    lastEmittedAt: cooldowns,
    sessionEntities: nextSessionEntities,
    canonicalState: snapshotCanonicalState(ctx),
    rulesVersion: cfg.version,
  };

  return {
    generatedAt: ctx.generatedAt,
    userId: ctx.userId,
    tradingDate: ctx.tradingDate,
    emitted,
    suppressed,
    checkpoint: nextCheckpoint,
    rulesVersion: cfg.version,
  };
}

function snapshotCanonicalState(ctx: AlertEvaluationContext): PriorSnapshot {
  const moduleStatuses = Object.fromEntries(
    ctx.runtime.modules.map((m) => [m.module, m.status]),
  ) as PriorSnapshot["moduleStatuses"];

  return {
    decisionBias: ctx.decision.bias,
    pcrDirection: ctx.pcr.direction ?? null,
    gtiState: ctx.gti.state ?? ctx.gti.bias,
    breadthState: ctx.breadth.state ?? ctx.breadth.bias,
    vixRegime: ctx.vix.regime,
    astroState: ctx.astro.state,
    gapLifecycle: ctx.gannGap.lifecycle,
    gapPredictionId: ctx.gannGap.predictionId ?? null,
    strategyId: ctx.strategy.topStrategyId ?? null,
    aiBias: ctx.ai.bias,
    moduleStatuses,
    moduleFreshness: {
      DECISION_ENGINE: ctx.decision.freshness,
      COMBINED_PCR: ctx.pcr.freshness,
      GTI: ctx.gti.freshness,
      MARKET_BREADTH: ctx.breadth.freshness,
      INDIA_VIX: ctx.vix.freshness,
    },
  };
}

export function emptyCheckpoint(userId: string, tradingDate: string, nowIso: string): AlertCheckpoint {
  return {
    userId,
    tradingDate,
    updatedAt: nowIso,
    emittedFingerprints: [],
    lastEmittedAt: {},
    sessionEntities: {},
    canonicalState: {},
    rulesVersion: DEFAULT_RULE_CONFIG.version,
  };
}