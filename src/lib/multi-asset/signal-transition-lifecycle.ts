// Phase 2 — Signal Transition Lifecycle. Provider-neutral.
// Consumes the finalized Decision Engine result as the canonical signal source.
// No formula recomputation. No broker execution. No order placement.

import type { DecisionAction, SignalState } from "@/lib/signal-transition/types";
import { decisionActionToSignalState } from "@/lib/signal-transition/types";
import {
  evaluateSignalTransition,
  type EvaluateSignalTransitionInput,
} from "@/lib/signal-transition/engine";
import type { SignalTransition } from "@/lib/signal-transition/types";

// ---------------------------------------------------------------------------
// Decision Action → Signal State normalization (authoritative)
// ---------------------------------------------------------------------------

/**
 * Normalize a Decision Engine DecisionAction to the canonical SignalState.
 * Re-exports from types for convenience.
 */
export { decisionActionToSignalState } from "@/lib/signal-transition/types";

// ---------------------------------------------------------------------------
// Transition evaluation from Decision Engine result
// ---------------------------------------------------------------------------

export interface DecisionSignalInput {
  readonly decisionAction: DecisionAction;
  readonly instrument: string;
  readonly confidence: number | null;
  readonly spot: number | null;
  readonly decisionRunId: string;
  readonly evaluatedAt: string;
  readonly explanation: string;
}

export interface SignalTransitionEvaluationResult {
  readonly currentSignal: SignalState;
  readonly previousSignal: SignalState | null;
  readonly decisionAction: DecisionAction;
  readonly transitionOccurred: boolean;
  readonly transitionId: string | null;
  readonly transition: SignalTransition | null;
}

/**
 * Evaluate signal transition from a finalized Decision Engine result.
 * This is the main entry point called by the Decision Engine lifecycle.
 * Returns the transition result for downstream notification/Telegram handling.
 */
export function evaluateDecisionSignalTransition(
  input: DecisionSignalInput,
  previousSignal: SignalState | null,
): SignalTransitionEvaluationResult {
  const currentSignal = decisionActionToSignalState(input.decisionAction);

  // Build the transition evaluation input
  const evalInput: EvaluateSignalTransitionInput = {
    previousState: previousSignal,
    currentState: currentSignal,
    instrument: input.instrument,
    price: input.spot,
    confidence: input.confidence,
    researchSummary: input.explanation,
    runId: input.decisionRunId,
    tradingDate: input.evaluatedAt.slice(0, 10),
    generatedAt: input.evaluatedAt,
  };

  const result = evaluateSignalTransition(evalInput);

  // Build the full SignalTransition if a transition occurred
  let transition: SignalTransition | null = null;
  if (result.isTransition && result.transition) {
    transition = {
      ...result.transition,
      key: {
        ...result.transition.key,
        runId: input.decisionRunId,
      },
    };
  }

  return {
    currentSignal,
    previousSignal,
    decisionAction: input.decisionAction,
    transitionOccurred: result.isTransition,
    transitionId: result.transition?.id ?? null,
    transition,
  };
}
