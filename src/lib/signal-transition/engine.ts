// Phase P1 — Signal Transition Engine. Pure. No I/O. No formulas.
// Detects BUY/SELL/WAIT state transitions and produces deterministic
// transition events with deduplication fingerprints.

import type {
  SignalState,
  SignalTransition,
  SignalTransitionKey,
  SignalTransitionConfig,
  SignalTelegramMessage,
} from "./types";
import { isStateChange, DEFAULT_SIGNAL_TRANSITION_CONFIG } from "./types";

// ---------------------------------------------------------------------------
// Fingerprint computation (deterministic, no I/O)
// ---------------------------------------------------------------------------

/**
 * Build a deterministic transition fingerprint for deduplication.
 * Same transition + instrument + tradingDate + runId → same fingerprint.
 */
export function computeTransitionFingerprint(key: SignalTransitionKey): string {
  const parts = [
    key.previous ?? "INIT",
    key.current,
    key.instrument,
    key.tradingDate,
    key.runId,
  ].join("|");
  return simpleHash(parts);
}

function simpleHash(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) - h + input.charCodeAt(i)) | 0;
  }
  return `sig-${Math.abs(h).toString(36)}`;
}

// ---------------------------------------------------------------------------
// In-memory deduplication store (module-scoped, process-lifetime)
// ---------------------------------------------------------------------------

const seenFingerprints = new Map<string, number>(); // fingerprint → timestamp

export function resetSignalDedupeStoreForTests(): void {
  seenFingerprints.clear();
}

function isDuplicate(fingerprint: string, nowMs: number, windowMs: number): boolean {
  const last = seenFingerprints.get(fingerprint);
  if (last == null) return false;
  return nowMs - last < windowMs;
}

function markSeen(fingerprint: string, nowMs: number): void {
  seenFingerprints.set(fingerprint, nowMs);
  // Prune old entries to avoid unbounded growth (keep last 500)
  if (seenFingerprints.size > 500) {
    const entries = [...seenFingerprints.entries()].sort((a, b) => a[1] - b[1]);
    for (let i = 0; i < entries.length - 250; i++) {
      seenFingerprints.delete(entries[i][0]);
    }
  }
}

// ---------------------------------------------------------------------------
// Transition detection
// ---------------------------------------------------------------------------

export interface EvaluateSignalTransitionInput {
  readonly previousState: SignalState | null;
  readonly currentState: SignalState;
  readonly instrument: string;
  readonly price: number | null;
  readonly confidence: number | null;
  readonly researchSummary: string;
  readonly runId: string;
  readonly tradingDate: string;
  readonly generatedAt: string;
  readonly config?: SignalTransitionConfig;
}

export interface EvaluateSignalTransitionResult {
  readonly transition: SignalTransition | null;
  readonly isTransition: boolean;
  readonly suppressed: boolean;
  readonly suppressReason: null | "SAME_STATE" | "DUPLICATE";
}

/**
 * Evaluate a signal state change. Returns a transition event if the
 * effective state actually changed and has not been recently seen.
 */
export function evaluateSignalTransition(
  input: EvaluateSignalTransitionInput,
): EvaluateSignalTransitionResult {
  const cfg = input.config ?? DEFAULT_SIGNAL_TRANSITION_CONFIG;
  const nowMs = Date.parse(input.generatedAt) || Date.now();

  // No change → suppress
  if (!isStateChange(input.previousState, input.currentState)) {
    return { transition: null, isTransition: false, suppressed: true, suppressReason: "SAME_STATE" };
  }

  const key: SignalTransitionKey = {
    previous: input.previousState,
    current: input.currentState,
    instrument: input.instrument,
    tradingDate: input.tradingDate,
    runId: input.runId,
  };

  const fingerprint = computeTransitionFingerprint(key);

  // Duplicate → suppress
  if (isDuplicate(fingerprint, nowMs, cfg.dedupeWindowMs)) {
    return { transition: null, isTransition: false, suppressed: true, suppressReason: "DUPLICATE" };
  }

  markSeen(fingerprint, nowMs);

  const transition: SignalTransition = {
    id: fingerprint,
    key,
    previous: input.previousState,
    current: input.currentState,
    instrument: input.instrument,
    price: input.price,
    confidence: input.confidence,
    researchSummary: input.researchSummary,
    runId: input.runId,
    tradingDate: input.tradingDate,
    timestamp: input.generatedAt,
    isDirectional: input.currentState !== "WAIT",
    isTransition: true,
  };

  return { transition, isTransition: true, suppressed: false, suppressReason: null };
}

// ---------------------------------------------------------------------------
// Telegram message formatting
// ---------------------------------------------------------------------------

const SIGNAL_DISCLAIMER = "No order has been placed.\nResearch signal only.";

export function formatSignalTelegramMessage(
  signal: SignalTransition,
): SignalTelegramMessage {
  const lines: string[] = [
    `🦅 EAGLEBABA ASTRO LEVELS`,
    ``,
    `<b>${signal.instrument}</b>`,
    `<b>SIGNAL: ${signal.current}</b>`,
    ``,
  ];

  if (signal.price != null && Number.isFinite(signal.price)) {
    lines.push(`Price: ${signal.price.toFixed(2)}`);
  } else {
    lines.push(`Price: —`);
  }

  lines.push(`State: ${signal.isDirectional ? "ACTIVE" : "NO ACTIVE DIRECTION"}`);
  lines.push(`Time: ${signal.timestamp}`);

  if (signal.previous) {
    lines.push(`Transition: ${signal.previous} → ${signal.current}`);
  }

  if (signal.confidence != null) {
    lines.push(`Confidence: ${signal.confidence}%`);
  }

  if (signal.researchSummary) {
    lines.push(``);
    lines.push(`Research context:`);
    lines.push(signal.researchSummary);
  }

  lines.push(``);
  lines.push(SIGNAL_DISCLAIMER);

  return { text: lines.join("\n") };
}
