// Phase 3C — Smart Alert Engine. Pure types. No formulas. No provider I/O.

import type { CanonicalBias } from "@/lib/option-strategy-terminal/types";

export const SMART_ALERTS_SCHEMA_VERSION = 1;
export const SMART_ALERTS_RULES_VERSION = "1.0.0";

export type AlertType =
  | "DECISION_CHANGED"
  | "GTI_DIRECTION_CHANGED"
  | "PCR_REGIME_CHANGED"
  | "BREADTH_REVERSAL"
  | "VIX_REGIME_CHANGED"
  | "GANN_LEVEL_APPROACHING"
  | "GANN_LEVEL_TOUCHED"
  | "ASTRO_WINDOW_STARTING"
  | "ASTRO_WINDOW_ACTIVE"
  | "GANN_GAP_PREDICTION_FROZEN"
  | "GANN_GAP_OUTCOME_AVAILABLE"
  | "OPTION_STRATEGY_CHANGED"
  | "AI_MARKET_BIAS_CHANGED"
  | "RUNTIME_MODULE_DEGRADED"
  | "RUNTIME_MODULE_RECOVERED"
  | "DATA_STALE"
  | "DATA_RECOVERED";

export type AlertCategory = "MARKET_SIGNAL" | "RESEARCH" | "SYSTEM_HEALTH";

export type AlertPriority = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type AlertFreshness = "LIVE" | "MIXED" | "RESEARCH_DEMO" | "STALE" | "UNKNOWN";

export type AlertSourceModule =
  | "DECISION_ENGINE"
  | "COMBINED_PCR"
  | "GTI"
  | "MARKET_BREADTH"
  | "INDIA_VIX"
  | "ASTRO"
  | "GANN"
  | "GANN_GAP_OUTLOOK"
  | "OPTION_STRATEGY_TERMINAL"
  | "AI_MARKET_ASSISTANT"
  | "RUNTIME_READINESS";

export interface AlertEvidenceItem {
  readonly module: AlertSourceModule;
  readonly previous: string | null;
  readonly current: string | null;
  readonly freshness: AlertFreshness;
  readonly available: boolean;
  readonly note?: string;
}

export interface AlertEvent {
  readonly id: string;
  readonly fingerprint: string;
  readonly type: AlertType;
  readonly category: AlertCategory;
  readonly priority: AlertPriority;
  readonly title: string;
  readonly summary: string;
  readonly instrument: string | null;
  readonly previousState: string | null;
  readonly currentState: string | null;
  readonly evidence: readonly AlertEvidenceItem[];
  readonly sourceModules: readonly AlertSourceModule[];
  readonly freshness: AlertFreshness;
  readonly createdAt: string;
  readonly tradingDate: string;
  readonly expiresAt: string | null;
  readonly researchOnly: boolean;
  readonly disclaimer: string;
  readonly rulesVersion: string;
  readonly deliveryStatus: readonly AlertDeliveryAttempt[];
}

export interface AlertDeliveryAttempt {
  readonly provider: AlertDeliveryProviderId;
  readonly attemptedAt: string;
  readonly status: "DELIVERED" | "SKIPPED" | "DISABLED" | "FAILED" | "RETRY";
  readonly errorCode: string | null;
  readonly retryable: boolean;
  readonly fingerprint: string;
}

export type AlertDeliveryProviderId = "IN_APP" | "EMAIL" | "TELEGRAM" | "WEBHOOK";

export type CanonicalDirection = CanonicalBias | "UNKNOWN";
export type CanonicalVixRegime = "LOW" | "MID" | "HIGH" | "UNKNOWN";

export interface DecisionSnapshotView {
  readonly available: boolean;
  readonly action: string | null;
  readonly bias: CanonicalDirection;
  readonly freshness: AlertFreshness;
}

export interface PcrSnapshotView {
  readonly available: boolean;
  readonly direction: string | null;
  readonly bias: CanonicalDirection;
  readonly freshness: AlertFreshness;
}

export interface GtiSnapshotView {
  readonly available: boolean;
  readonly state: string | null;
  readonly bias: CanonicalDirection;
  readonly freshness: AlertFreshness;
}

export interface BreadthSnapshotView {
  readonly available: boolean;
  readonly state: string | null;
  readonly bias: CanonicalDirection;
  readonly freshness: AlertFreshness;
}

export interface VixSnapshotView {
  readonly available: boolean;
  readonly value: number | null;
  readonly regime: CanonicalVixRegime;
  readonly freshness: AlertFreshness;
}

export interface AstroWindowView {
  readonly available: boolean;
  readonly state: "UPCOMING" | "ACTIVE" | "PAST" | "NONE";
  readonly label: string | null;
  readonly startsInMinutes: number | null;
  readonly freshness: AlertFreshness;
}

export interface GannLevelView {
  readonly available: boolean;
  readonly closestLabel: string | null;
  readonly distancePoints: number | null;
  readonly touched: boolean;
  readonly instrument: string;
  readonly freshness: AlertFreshness;
}

export interface GannGapView {
  readonly available: boolean;
  readonly predictionId: string | null;
  readonly lifecycle: "PENDING" | "PROVISIONAL" | "FROZEN" | "OUTCOME";
  readonly label: string | null;
  readonly freshness: AlertFreshness;
}

export interface StrategyView {
  readonly available: boolean;
  readonly topStrategyId: string | null;
  readonly bias: CanonicalDirection;
  readonly freshness: AlertFreshness;
}

export interface AiAssistantView {
  readonly available: boolean;
  readonly bias: CanonicalDirection;
  readonly confidence: string | null;
  readonly freshness: AlertFreshness;
}

export interface RuntimeModuleView {
  readonly module: AlertSourceModule;
  readonly status: "HEALTHY" | "DEGRADED" | "UNAVAILABLE";
  readonly reason: string | null;
}

export interface RuntimeView {
  readonly available: boolean;
  readonly modules: readonly RuntimeModuleView[];
  readonly overall: "READY" | "PARTIALLY_READY" | "NOT_READY" | "UNKNOWN";
}

export interface AlertEvaluationContext {
  readonly generatedAt: string;
  readonly tradingDate: string;
  readonly userId: string;
  readonly instruments: readonly string[]; // instruments in scope
  readonly decision: DecisionSnapshotView;
  readonly pcr: PcrSnapshotView;
  readonly gti: GtiSnapshotView;
  readonly breadth: BreadthSnapshotView;
  readonly vix: VixSnapshotView;
  readonly astro: AstroWindowView;
  readonly gannLevels: readonly GannLevelView[];
  readonly gannGap: GannGapView;
  readonly strategy: StrategyView;
  readonly ai: AiAssistantView;
  readonly runtime: RuntimeView;
}

export interface AlertCheckpoint {
  readonly userId: string;
  readonly updatedAt: string;
  readonly lastFingerprintsByType: Readonly<Record<string, string>>;
  readonly lastEmittedAtByFingerprint: Readonly<Record<string, string>>;
  readonly emittedFingerprintsThisSession: readonly string[];
  // Snapshot of prior canonical states used for transition detection.
  readonly previous: {
    readonly decisionBias?: CanonicalDirection;
    readonly pcrDirection?: string | null;
    readonly gtiState?: string | null;
    readonly breadthState?: string | null;
    readonly vixRegime?: CanonicalVixRegime;
    readonly astroState?: AstroWindowView["state"];
    readonly gapLifecycle?: GannGapView["lifecycle"];
    readonly gapPredictionId?: string | null;
    readonly strategyId?: string | null;
    readonly aiBias?: CanonicalDirection;
    readonly moduleStatuses?: Readonly<Record<string, RuntimeModuleView["status"]>>;
    readonly moduleFreshness?: Readonly<Record<string, AlertFreshness>>;
  };
}

export interface AlertSubscription {
  readonly userId: string;
  readonly types: Readonly<Record<AlertType, boolean>>;
  readonly instruments: readonly string[]; // empty means all
  readonly minimumPriority: AlertPriority;
  readonly inAppEnabled: boolean;
  readonly emailEnabled: boolean;
  readonly telegramEnabled: boolean;
  readonly webhookEnabled: boolean;
  readonly quietHours: { readonly start: string; readonly end: string } | null; // "HH:MM"
  readonly cooldownOverrideSec: number | null; // clamped in dedupe module
  readonly timezone: string;
}

export const ALERT_DISCLAIMER =
  "Research Only — Not Investment Advice — No Execution.";

export interface RuleEvaluationOutput {
  readonly emitted: readonly AlertEvent[];
  readonly suppressed: readonly {
    readonly reason:
      | "DUPLICATE"
      | "COOLDOWN"
      | "SAME_SESSION"
      | "SUBSCRIPTION_DISABLED"
      | "MIN_PRIORITY"
      | "QUIET_HOURS"
      | "UNAVAILABLE_INPUT"
      | "NO_TRANSITION";
    readonly fingerprint: string;
    readonly type: AlertType;
  }[];
  readonly nextCheckpoint: AlertCheckpoint;
  readonly diagnostics: EngineDiagnostics;
}

export interface EngineDiagnostics {
  readonly rulesEvaluated: number;
  readonly eventsGenerated: number;
  readonly eventsSuppressed: number;
  readonly fingerprintsCreated: number;
  readonly dedupeHits: number;
  readonly cooldownHits: number;
  readonly durationMs: number;
  readonly canonicalAvailability: Readonly<Record<string, boolean>>;
  readonly rulesVersion: string;
}

export type SchedulerAction =
  | "EVALUATE_NOW"
  | "IDLE_MARKET_CLOSED"
  | "IDLE_COOLDOWN"
  | "IDLE_NO_SUBSCRIPTIONS"
  | "IDLE_DISABLED"
  | "ERROR_RETRYABLE";

export interface SchedulerDecision {
  readonly action: SchedulerAction;
  readonly reason: string;
  readonly nextRetryInSec: number | null;
}