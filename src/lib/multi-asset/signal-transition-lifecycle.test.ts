// Phase 2 — Signal Transition Lifecycle tests.
// Tests the pure deterministic parts of the Decision Engine lifecycle wiring.
// No I/O. No Supabase. No Telegram API. No formula changes.

import { describe, expect, it } from "vitest";
import { decisionActionToSignalState } from "@/lib/signal-transition/types";
import type { DecisionAction, SignalState } from "@/lib/signal-transition/types";
import {
  evaluateDecisionSignalTransition,
  type DecisionSignalInput,
} from "./signal-transition-lifecycle";

// ---------------------------------------------------------------------------
// FIXTURE: DecisionAction → SignalState normalization
// ---------------------------------------------------------------------------

describe("DecisionAction → SignalState normalization", () => {
  it("STRONG_BUY_CE → BUY", () => {
    expect(decisionActionToSignalState("STRONG_BUY_CE")).toBe("BUY");
  });

  it("BUY_CE → BUY", () => {
    expect(decisionActionToSignalState("BUY_CE")).toBe("BUY");
  });

  it("WAIT → WAIT", () => {
    expect(decisionActionToSignalState("WAIT")).toBe("WAIT");
  });

  it("BUY_PE → SELL", () => {
    expect(decisionActionToSignalState("BUY_PE")).toBe("SELL");
  });

  it("STRONG_BUY_PE → SELL", () => {
    expect(decisionActionToSignalState("STRONG_BUY_PE")).toBe("SELL");
  });
});

// ---------------------------------------------------------------------------
// FIXTURE: evaluateDecisionSignalTransition
// ---------------------------------------------------------------------------

function makeInput(overrides: Partial<DecisionSignalInput> = {}): DecisionSignalInput {
  return {
    decisionAction: "BUY_CE",
    instrument: "NIFTY50",
    confidence: 72,
    spot: 24350.75,
    decisionRunId: "decision-NIFTY50-20260818073000-BUY-CE-72",
    evaluatedAt: "2026-08-18T07:30:00.000Z",
    explanation: "Astro active. Gann UP. PCR bullish.",
    ...overrides,
  };
}

describe("evaluateDecisionSignalTransition", () => {
  // --- Same-state suppression ---
  it("BUY → BUY = no transition", () => {
    const result = evaluateDecisionSignalTransition(makeInput(), "BUY");
    expect(result.transitionOccurred).toBe(false);
    expect(result.currentSignal).toBe("BUY");
    expect(result.previousSignal).toBe("BUY");
  });

  it("SELL → SELL = no transition", () => {
    const result = evaluateDecisionSignalTransition(
      makeInput({ decisionAction: "BUY_PE" }),
      "SELL",
    );
    expect(result.transitionOccurred).toBe(false);
    expect(result.currentSignal).toBe("SELL");
  });

  it("WAIT → WAIT = no transition", () => {
    const result = evaluateDecisionSignalTransition(
      makeInput({ decisionAction: "WAIT" }),
      "WAIT",
    );
    expect(result.transitionOccurred).toBe(false);
    expect(result.currentSignal).toBe("WAIT");
  });

  // --- Transition detection ---
  it("WAIT → BUY = transition", () => {
    const result = evaluateDecisionSignalTransition(makeInput(), "WAIT");
    expect(result.transitionOccurred).toBe(true);
    expect(result.currentSignal).toBe("BUY");
    expect(result.previousSignal).toBe("WAIT");
    expect(result.transition).not.toBeNull();
    expect(result.transition!.current).toBe("BUY");
    expect(result.transition!.isDirectional).toBe(true);
  });

  it("WAIT → SELL = transition", () => {
    const result = evaluateDecisionSignalTransition(
      makeInput({ decisionAction: "STRONG_BUY_PE" }),
      "WAIT",
    );
    expect(result.transitionOccurred).toBe(true);
    expect(result.currentSignal).toBe("SELL");
  });

  it("BUY → SELL = transition", () => {
    const result = evaluateDecisionSignalTransition(
      makeInput({ decisionAction: "BUY_PE" }),
      "BUY",
    );
    expect(result.transitionOccurred).toBe(true);
    expect(result.previousSignal).toBe("BUY");
    expect(result.currentSignal).toBe("SELL");
  });

  it("SELL → BUY = transition", () => {
    const result = evaluateDecisionSignalTransition(
      makeInput({ decisionAction: "STRONG_BUY_CE" }),
      "SELL",
    );
    expect(result.transitionOccurred).toBe(true);
    expect(result.previousSignal).toBe("SELL");
    expect(result.currentSignal).toBe("BUY");
  });

  it("BUY → WAIT = transition", () => {
    const result = evaluateDecisionSignalTransition(
      makeInput({ decisionAction: "WAIT" }),
      "BUY",
    );
    expect(result.transitionOccurred).toBe(true);
    expect(result.currentSignal).toBe("WAIT");
    expect(result.transition!.isDirectional).toBe(false);
  });

  it("SELL → WAIT = transition", () => {
    const result = evaluateDecisionSignalTransition(
      makeInput({ decisionAction: "WAIT" }),
      "SELL",
    );
    expect(result.transitionOccurred).toBe(true);
  });

  // --- Run ID preservation ---
  it("preserves Decision Engine Run ID in transition", () => {
    const result = evaluateDecisionSignalTransition(makeInput(), "WAIT");
    expect(result.transitionOccurred).toBe(true);
    expect(result.transition!.runId).toBe("decision-NIFTY50-20260818073000-BUY-CE-72");
  });

  // --- First evaluation (no previous state) ---
  it("first evaluation with no previous state = no transition", () => {
    const result = evaluateDecisionSignalTransition(makeInput(), null);
    expect(result.transitionOccurred).toBe(false);
    expect(result.currentSignal).toBe("BUY");
    expect(result.previousSignal).toBeNull();
  });

  // --- Intraday transitions ---
  it("handles intraday BUY → SELL → BUY sequence", () => {
    // First: WAIT → BUY
    const r1 = evaluateDecisionSignalTransition(makeInput(), "WAIT");
    expect(r1.transitionOccurred).toBe(true);
    expect(r1.currentSignal).toBe("BUY");

    // Second: BUY → SELL
    const r2 = evaluateDecisionSignalTransition(
      makeInput({ decisionAction: "BUY_PE", decisionRunId: "run-2" }),
      "BUY",
    );
    expect(r2.transitionOccurred).toBe(true);
    expect(r2.currentSignal).toBe("SELL");

    // Third: SELL → BUY
    const r3 = evaluateDecisionSignalTransition(
      makeInput({ decisionAction: "STRONG_BUY_CE", decisionRunId: "run-3" }),
      "SELL",
    );
    expect(r3.transitionOccurred).toBe(true);
    expect(r3.currentSignal).toBe("BUY");
  });

  // --- Confidence and price ---
  it("passes confidence and spot price to transition", () => {
    const result = evaluateDecisionSignalTransition(
      makeInput({ confidence: 85, spot: 24500 }),
      "WAIT",
    );
    expect(result.transition!.confidence).toBe(85);
    expect(result.transition!.price).toBe(24500);
  });

  // --- Instrument preservation ---
  it("preserves instrument in transition", () => {
    const result = evaluateDecisionSignalTransition(
      makeInput({ instrument: "BANKNIFTY" }),
      "WAIT",
    );
    expect(result.transition!.instrument).toBe("BANKNIFTY");
  });
});
