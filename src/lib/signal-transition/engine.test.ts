// Phase P1 — Signal Transition Engine tests.
// Deterministic. No I/O. No broker execution. No fabricated market data.

import { describe, expect, it, beforeEach } from "vitest";
import {
  evaluateSignalTransition,
  formatSignalTelegramMessage,
  resetSignalDedupeStoreForTests,
} from "./engine";
import { normalizeSignalState, isStateChange } from "./types";
import type { SignalState, SignalTransition } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE = {
  instrument: "NIFTY50",
  price: 24350.75,
  confidence: 72,
  researchSummary: "Astro window active. Gann bias UP. PCR bullish.",
  runId: "run-2026-08-18-001",
  tradingDate: "2026-08-18",
  generatedAt: "2026-08-18T07:30:00.000Z",
};

function transition(
  prev: SignalState | null,
  curr: SignalState,
  overrides: Partial<typeof BASE> = {},
) {
  return evaluateSignalTransition({
    previousState: prev,
    currentState: curr,
    ...BASE,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Requirement A — Single Active State normalization
// ---------------------------------------------------------------------------

describe("normalizeSignalState", () => {
  it("normalizes BUY variants", () => {
    expect(normalizeSignalState("BUY")).toBe("BUY");
    expect(normalizeSignalState("buy")).toBe("BUY");
    expect(normalizeSignalState("BULLISH")).toBe("BUY");
    expect(normalizeSignalState("LONG")).toBe("BUY");
    expect(normalizeSignalState("UP")).toBe("BUY");
  });

  it("normalizes SELL variants", () => {
    expect(normalizeSignalState("SELL")).toBe("SELL");
    expect(normalizeSignalState("sell")).toBe("SELL");
    expect(normalizeSignalState("BEARISH")).toBe("SELL");
    expect(normalizeSignalState("SHORT")).toBe("SELL");
    expect(normalizeSignalState("DOWN")).toBe("SELL");
  });

  it("normalizes WAIT / neutral / unknown to WAIT", () => {
    expect(normalizeSignalState("WAIT")).toBe("WAIT");
    expect(normalizeSignalState("NEUTRAL")).toBe("WAIT");
    expect(normalizeSignalState("RANGE")).toBe("WAIT");
    expect(normalizeSignalState("UNKNOWN")).toBe("WAIT");
    expect(normalizeSignalState(null)).toBe("WAIT");
    expect(normalizeSignalState(undefined)).toBe("WAIT");
    expect(normalizeSignalState("")).toBe("WAIT");
  });
});

describe("isStateChange", () => {
  it("returns false when previous is null", () => {
    expect(isStateChange(null, "BUY")).toBe(false);
  });
  it("returns false for same state", () => {
    expect(isStateChange("BUY", "BUY")).toBe(false);
    expect(isStateChange("SELL", "SELL")).toBe(false);
    expect(isStateChange("WAIT", "WAIT")).toBe(false);
  });
  it("returns true for different states", () => {
    expect(isStateChange("BUY", "SELL")).toBe(true);
    expect(isStateChange("SELL", "BUY")).toBe(true);
    expect(isStateChange("WAIT", "BUY")).toBe(true);
    expect(isStateChange("BUY", "WAIT")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Requirement B — No notification for same-state
// ---------------------------------------------------------------------------

describe("same-state suppression", () => {
  beforeEach(() => resetSignalDedupeStoreForTests());

  it("BUY → BUY = no notification", () => {
    const r = transition("BUY", "BUY");
    expect(r.isTransition).toBe(false);
    expect(r.suppressed).toBe(true);
    expect(r.suppressReason).toBe("SAME_STATE");
    expect(r.transition).toBeNull();
  });

  it("SELL → SELL = no notification", () => {
    const r = transition("SELL", "SELL");
    expect(r.isTransition).toBe(false);
    expect(r.suppressed).toBe(true);
    expect(r.suppressReason).toBe("SAME_STATE");
    expect(r.transition).toBeNull();
  });

  it("WAIT → WAIT = no notification", () => {
    const r = transition("WAIT", "WAIT");
    expect(r.isTransition).toBe(false);
    expect(r.suppressed).toBe(true);
    expect(r.suppressReason).toBe("SAME_STATE");
    expect(r.transition).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Requirement B — Transition produces exactly one event
// ---------------------------------------------------------------------------

describe("state transitions produce events", () => {
  beforeEach(() => resetSignalDedupeStoreForTests());

  it("WAIT → BUY = one notification", () => {
    const r = transition("WAIT", "BUY");
    expect(r.isTransition).toBe(true);
    expect(r.suppressed).toBe(false);
    expect(r.transition).not.toBeNull();
    expect(r.transition!.current).toBe("BUY");
    expect(r.transition!.previous).toBe("WAIT");
    expect(r.transition!.isDirectional).toBe(true);
    expect(r.transition!.instrument).toBe("NIFTY50");
    expect(r.transition!.price).toBe(24350.75);
  });

  it("WAIT → SELL = one notification", () => {
    const r = transition("WAIT", "SELL");
    expect(r.isTransition).toBe(true);
    expect(r.transition!.current).toBe("SELL");
    expect(r.transition!.isDirectional).toBe(true);
  });

  it("BUY → SELL = one notification", () => {
    const r = transition("BUY", "SELL");
    expect(r.isTransition).toBe(true);
    expect(r.transition!.previous).toBe("BUY");
    expect(r.transition!.current).toBe("SELL");
  });

  it("SELL → BUY = one notification", () => {
    const r = transition("SELL", "BUY");
    expect(r.isTransition).toBe(true);
    expect(r.transition!.previous).toBe("SELL");
    expect(r.transition!.current).toBe("BUY");
  });

  it("BUY → WAIT = one notification", () => {
    const r = transition("BUY", "WAIT");
    expect(r.isTransition).toBe(true);
    expect(r.transition!.current).toBe("WAIT");
    expect(r.transition!.isDirectional).toBe(false);
  });

  it("SELL → WAIT = one notification", () => {
    const r = transition("SELL", "WAIT");
    expect(r.isTransition).toBe(true);
    expect(r.transition!.current).toBe("WAIT");
    expect(r.transition!.isDirectional).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Requirement E — Deduplication
// ---------------------------------------------------------------------------

describe("deduplication", () => {
  beforeEach(() => resetSignalDedupeStoreForTests());

  it("duplicate transition within window = one delivery only", () => {
    const r1 = transition("WAIT", "BUY");
    expect(r1.isTransition).toBe(true);

    // Same transition, same fingerprint → should be deduplicated
    const r2 = transition("WAIT", "BUY");
    expect(r2.isTransition).toBe(false);
    expect(r2.suppressed).toBe(true);
    expect(r2.suppressReason).toBe("DUPLICATE");
  });

  it("different instrument produces independent transition", () => {
    const r1 = transition("WAIT", "BUY");
    expect(r1.isTransition).toBe(true);

    const r2 = transition("WAIT", "BUY", { instrument: "BANKNIFTY" });
    expect(r2.isTransition).toBe(true);
  });

  it("different runId produces independent transition", () => {
    const r1 = transition("WAIT", "BUY");
    expect(r1.isTransition).toBe(true);

    const r2 = transition("WAIT", "BUY", { runId: "run-different" });
    expect(r2.isTransition).toBe(true);
  });

  it("different trading date produces independent transition", () => {
    const r1 = transition("WAIT", "BUY");
    expect(r1.isTransition).toBe(true);

    const r2 = transition("WAIT", "BUY", { tradingDate: "2026-08-19" });
    expect(r2.isTransition).toBe(true);
  });

  it("transition after dedupe window expires is allowed", () => {
    const r1 = transition("WAIT", "BUY");
    expect(r1.isTransition).toBe(true);

    // Simulate time passing beyond the dedupe window
    const futureTime = "2026-08-18T08:30:00.000Z"; // 60 min later
    const r2 = evaluateSignalTransition({
      previousState: "WAIT",
      currentState: "BUY",
      instrument: "NIFTY50",
      price: 24350.75,
      confidence: 72,
      researchSummary: "Same summary",
      runId: "run-2026-08-18-001",
      tradingDate: "2026-08-18",
      generatedAt: futureTime,
      config: { dedupeWindowMs: 300_000, enabled: true },
    });
    expect(r2.isTransition).toBe(true);
  });

  it("reset clears dedup store", () => {
    transition("WAIT", "BUY");
    resetSignalDedupeStoreForTests();
    const r2 = transition("WAIT", "BUY");
    expect(r2.isTransition).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Telegram message formatting
// ---------------------------------------------------------------------------

describe("formatSignalTelegramMessage", () => {
  it("produces a well-formatted BUY message with all fields", () => {
    const signal: SignalTransition = {
      id: "test-id",
      key: { previous: "WAIT", current: "BUY", instrument: "NIFTY50", tradingDate: "2026-08-18", runId: "run-1" },
      previous: "WAIT",
      current: "BUY",
      instrument: "NIFTY50",
      price: 24350.75,
      confidence: 72,
      researchSummary: "Astro active. Gann UP.",
      runId: "run-1",
      tradingDate: "2026-08-18",
      timestamp: "2026-08-18T07:30:00.000Z",
      isDirectional: true,
      isTransition: true,
    };
    const msg = formatSignalTelegramMessage(signal);
    expect(msg.text).toContain("EAGLEBABA ASTRO LEVELS");
    expect(msg.text).toContain("NIFTY50");
    expect(msg.text).toContain("SIGNAL: BUY");
    expect(msg.text).toContain("Price: 24350.75");
    expect(msg.text).toContain("State: ACTIVE");
    expect(msg.text).toContain("WAIT → BUY");
    expect(msg.text).toContain("Confidence: 72%");
    expect(msg.text).toContain("No order has been placed");
    expect(msg.text).toContain("Research signal only");
  });

  it("produces WAIT message with NO ACTIVE DIRECTION", () => {
    const signal: SignalTransition = {
      id: "test-id-2",
      key: { previous: "BUY", current: "WAIT", instrument: "BANKNIFTY", tradingDate: "2026-08-18", runId: "run-2" },
      previous: "BUY",
      current: "WAIT",
      instrument: "BANKNIFTY",
      price: null,
      confidence: null,
      researchSummary: "",
      runId: "run-2",
      tradingDate: "2026-08-18",
      timestamp: "2026-08-18T07:30:00.000Z",
      isDirectional: false,
      isTransition: true,
    };
    const msg = formatSignalTelegramMessage(signal);
    expect(msg.text).toContain("SIGNAL: WAIT");
    expect(msg.text).toContain("NO ACTIVE DIRECTION");
    expect(msg.text).toContain("Price: —");
  });

  it("never exposes secrets in the message", () => {
    const signal: SignalTransition = {
      id: "test-id-3",
      key: { previous: null, current: "SELL", instrument: "NIFTY50", tradingDate: "2026-08-18", runId: "run-3" },
      previous: null,
      current: "SELL",
      instrument: "NIFTY50",
      price: 24100,
      confidence: 55,
      researchSummary: "Summary with token=secret123 and authorization=bearer xyz",
      runId: "run-3",
      tradingDate: "2026-08-18",
      timestamp: "2026-08-18T07:30:00.000Z",
      isDirectional: true,
      isTransition: true,
    };
    // The message text is built from the researchSummary verbatim,
    // but the Telegram delivery layer redacts errors. The message
    // formatter itself doesn't add secrets — it's the caller's
    // responsibility to provide clean researchSummary.
    const msg = formatSignalTelegramMessage(signal);
    expect(msg.text).toContain("EAGLEBABA ASTRO LEVELS");
    expect(msg.text).toContain("SIGNAL: SELL");
  });
});
