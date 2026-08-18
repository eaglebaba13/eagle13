// Phase P1+P2 — Signal Transition types.
// Pure types for the single-active BUY / SELL / WAIT signal state machine.
// No I/O. No formulas. No broker execution.

/** The three canonical directional states. */
export type SignalState = "BUY" | "SELL" | "WAIT";

/** Decision Engine action — the authoritative signal source. */
export type DecisionAction =
  | "STRONG_BUY_CE"
  | "BUY_CE"
  | "WAIT"
  | "BUY_PE"
  | "STRONG_BUY_PE";

/** Structured transition identity for deduplication. */
export interface SignalTransitionKey {
  readonly previous: SignalState | null;
  readonly current: SignalState;
  readonly instrument: string;
  readonly tradingDate: string;
  readonly runId: string;
}

/** A fully resolved signal transition event. */
export interface SignalTransition {
  readonly id: string;
  readonly key: SignalTransitionKey;
  readonly previous: SignalState | null;
  readonly current: SignalState;
  readonly instrument: string;
  readonly price: number | null;
  readonly confidence: number | null;
  readonly researchSummary: string;
  readonly runId: string;
  readonly tradingDate: string;
  readonly timestamp: string;
  /** Whether this transition is directional (BUY or SELL) vs inactive (WAIT). */
  readonly isDirectional: boolean;
  /** Whether this represents a genuine state change. */
  readonly isTransition: boolean;
}

/** Telegram message payload (not yet sent). */
export interface SignalTelegramMessage {
  readonly text: string;
  readonly parseMode?: "HTML" | "Markdown";
}

/** Delivery outcome for a single Telegram message. */
export interface SignalTelegramDeliveryResult {
  readonly delivered: boolean;
  readonly status: "DELIVERED" | "FAILED" | "CONFIG_MISSING" | "DUPLICATE" | "SENDING" | "SKIPPED";
  readonly messageId: number | null;
  readonly error?: string;
}

/** UI alarm payload. */
export interface SignalAlarm {
  readonly signal: SignalTransition;
  readonly acknowledged: boolean;
  readonly acknowledgedAt: string | null;
}

/** Configuration for the signal transition engine. */
export interface SignalTransitionConfig {
  readonly dedupeWindowMs: number; // default 300_000 (5 min)
  readonly enabled: boolean;
}

export const DEFAULT_SIGNAL_TRANSITION_CONFIG: SignalTransitionConfig = {
  dedupeWindowMs: 300_000,
  enabled: true,
};

/** Check if two signal states are different. */
export function isStateChange(previous: SignalState | null, current: SignalState): boolean {
  return previous !== null && previous !== current;
}

/** Normalize arbitrary directional strings to canonical SignalState. */
export function normalizeSignalState(raw: string | null | undefined): SignalState {
  if (!raw) return "WAIT";
  const s = raw.toUpperCase().trim();
  if (s.includes("BUY") || s.includes("BULL") || s.includes("LONG") || s.includes("UP")) return "BUY";
  if (s.includes("SELL") || s.includes("BEAR") || s.includes("SHORT") || s.includes("DOWN")) return "SELL";
  return "WAIT";
}

/**
 * Normalize a Decision Engine DecisionAction to the canonical SignalState.
 * This is the authoritative mapping from the Decision Engine output.
 *
 * STRONG_BUY_CE → BUY
 * BUY_CE        → BUY
 * BUY_PE        → SELL
 * STRONG_BUY_PE → SELL
 * WAIT          → WAIT
 */
export function decisionActionToSignalState(action: DecisionAction): SignalState {
  switch (action) {
    case "STRONG_BUY_CE":
    case "BUY_CE":
      return "BUY";
    case "BUY_PE":
    case "STRONG_BUY_PE":
      return "SELL";
    case "WAIT":
      return "WAIT";
  }
}
