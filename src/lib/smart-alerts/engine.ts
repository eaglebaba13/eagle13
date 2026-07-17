// Phase 3C — Pure Smart Alert engine runner. Deterministic.

import { deliverEvent, DEFAULT_DELIVERY_PROVIDERS, type AlertDeliveryProvider } from "./delivery";
import {
  effectiveCooldownSec,
  isDuplicate,
  isInCooldown,
  isInQuietHours,
  isInSameSession,
  makeEmptyCheckpoint,
  mergeCheckpointAfterEmit,
} from "./dedupe";
import { generateAlertEvents, snapshotPrior } from "./events";
import { meetsMinimumPriority } from "./priority";
import { DEFAULT_RULE_CONFIG, type AlertRuleConfig } from "./rules";
import { subscriptionMatches } from "./subscriptions";
import type {
  AlertCheckpoint,
  AlertEvaluationContext,
  AlertEvent,
  AlertSubscription,
  RuleEvaluationOutput,
} from "./types";

export interface RunAlertsInput {
  readonly context: AlertEvaluationContext;
  readonly checkpoint: AlertCheckpoint;
  readonly subscription: AlertSubscription | null;
  readonly config?: AlertRuleConfig;
  readonly providers?: readonly AlertDeliveryProvider[];
}

export function runAlertEngine(input: RunAlertsInput): RuleEvaluationOutput {
  const t0 = Date.now();
  const cfg = input.config ?? DEFAULT_RULE_CONFIG;
  const ctx = input.context;
  const sub = input.subscription;
  const providers = input.providers ?? DEFAULT_DELIVERY_PROVIDERS;

  const candidates = generateAlertEvents(ctx, input.checkpoint.previous, cfg);

  const emitted: AlertEvent[] = [];
  type SuppressedItem = RuleEvaluationOutput["suppressed"][number];
  const suppressed: SuppressedItem[] = [];
  let cp: AlertCheckpoint = input.checkpoint;
  const cooldownSec = effectiveCooldownSec(sub);
  const nowMs = Date.parse(ctx.generatedAt);
  let dedupeHits = 0;
  let cooldownHits = 0;

  for (const evt of candidates) {
    const subCheck = subscriptionMatches(sub, evt.type, evt.instrument);
    if (!subCheck.ok) {
      suppressed.push({ reason: "SUBSCRIPTION_DISABLED", fingerprint: evt.fingerprint, type: evt.type });
      continue;
    }
    if (sub && !meetsMinimumPriority(evt.priority, sub.minimumPriority)) {
      suppressed.push({ reason: "MIN_PRIORITY", fingerprint: evt.fingerprint, type: evt.type });
      continue;
    }
    if (isDuplicate(cp, evt)) {
      dedupeHits += 1;
      suppressed.push({ reason: "DUPLICATE", fingerprint: evt.fingerprint, type: evt.type });
      continue;
    }
    if (isInSameSession(cp, evt)) {
      suppressed.push({ reason: "SAME_SESSION", fingerprint: evt.fingerprint, type: evt.type });
      continue;
    }
    if (!Number.isNaN(nowMs) && isInCooldown(cp, evt, cooldownSec, nowMs)) {
      cooldownHits += 1;
      suppressed.push({ reason: "COOLDOWN", fingerprint: evt.fingerprint, type: evt.type });
      continue;
    }
    if ((evt.priority === "INFO" || evt.priority === "LOW") && isInQuietHours(sub, ctx.generatedAt)) {
      suppressed.push({ reason: "QUIET_HOURS", fingerprint: evt.fingerprint, type: evt.type });
      continue;
    }

    const attempts = deliverEvent(evt, sub, ctx.generatedAt, providers);
    const delivered: AlertEvent = { ...evt, deliveryStatus: attempts };
    emitted.push(delivered);
    cp = mergeCheckpointAfterEmit(cp, delivered, ctx.generatedAt);
  }

  const nextCheckpoint: AlertCheckpoint = {
    ...cp,
    userId: ctx.userId,
    updatedAt: ctx.generatedAt,
    previous: snapshotPrior(ctx),
  };

  const canonicalAvailability = {
    DECISION_ENGINE: ctx.decision.available,
    COMBINED_PCR: ctx.pcr.available,
    GTI: ctx.gti.available,
    MARKET_BREADTH: ctx.breadth.available,
    INDIA_VIX: ctx.vix.available,
    ASTRO: ctx.astro.available,
    GANN_GAP_OUTLOOK: ctx.gannGap.available,
    OPTION_STRATEGY_TERMINAL: ctx.strategy.available,
    AI_MARKET_ASSISTANT: ctx.ai.available,
    RUNTIME_READINESS: ctx.runtime.available,
  };

  return {
    emitted,
    suppressed,
    nextCheckpoint,
    diagnostics: {
      rulesEvaluated: candidates.length,
      eventsGenerated: candidates.length,
      eventsSuppressed: suppressed.length,
      fingerprintsCreated: emitted.length,
      dedupeHits,
      cooldownHits,
      durationMs: Math.max(0, Date.now() - t0),
      canonicalAvailability,
      rulesVersion: cfg.version,
    },
  };
}

export function emptyCheckpoint(userId: string, nowIso: string): AlertCheckpoint {
  return makeEmptyCheckpoint(userId, nowIso);
}