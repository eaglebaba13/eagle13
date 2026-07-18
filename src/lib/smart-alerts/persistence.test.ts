// Phase 3C-2 — Deterministic mapping tests for smart-alerts persistence.

import { describe, expect, it } from "vitest";
import { runAlertEngine, emptyCheckpoint } from "./engine";
import { defaultSubscription } from "./subscriptions";
import type { AlertEvaluationContext, AlertPriority } from "./types";

function ctx(now = "2026-07-17T04:30:00.000Z"): AlertEvaluationContext {
  return {
    generatedAt: now,
    tradingDate: "2026-07-17",
    userId: "u1",
    instruments: ["NIFTY"],
    decision: { available: true, action: "BUY_CE", bias: "BULLISH", freshness: "LIVE" },
    pcr: { available: true, direction: "BULLISH", bias: "BULLISH", freshness: "LIVE" },
    gti: { available: true, state: "BULLISH_TREND", bias: "BULLISH", freshness: "LIVE" },
    breadth: { available: true, state: "BULLISH", bias: "BULLISH", freshness: "MIXED" },
    vix: { available: true, value: 22, regime: "HIGH", freshness: "LIVE" },
    astro: { available: true, state: "NONE", label: null, startsInMinutes: null, freshness: "LIVE" },
    gannLevels: [],
    gannGap: { available: true, predictionId: "p1", lifecycle: "PROVISIONAL", label: null, freshness: "LIVE" },
    strategy: { available: true, topStrategyId: "long_call", bias: "BULLISH", freshness: "LIVE" },
    ai: { available: true, bias: "BULLISH", confidence: "MEDIUM", freshness: "LIVE" },
    runtime: { available: true, modules: [{ module: "DECISION_ENGINE", status: "HEALTHY", reason: null }], overall: "READY" },
  };
}

describe("smart-alerts persistence (pure)", () => {
  it("engine output rows serialize to strings suitable for DB insert", () => {
    const first = runAlertEngine({
      context: ctx(),
      checkpoint: emptyCheckpoint("u1", "2026-07-17T04:30:00.000Z"),
      subscription: defaultSubscription("u1"),
    });
    const flipped: AlertEvaluationContext = {
      ...ctx("2026-07-17T04:31:00.000Z"),
      decision: { available: true, action: "BUY_PE", bias: "BEARISH", freshness: "LIVE" },
    };
    const second = runAlertEngine({
      context: flipped,
      checkpoint: first.nextCheckpoint,
      subscription: defaultSubscription("u1"),
    });
    for (const ev of second.emitted) {
      expect(typeof ev.id).toBe("string");
      expect(typeof ev.fingerprint).toBe("string");
      expect(typeof ev.title).toBe("string");
      expect(typeof ev.summary).toBe("string");
      const priorities: AlertPriority[] = ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"];
      expect(priorities).toContain(ev.priority);
      expect(new Date(ev.createdAt).toString()).not.toBe("Invalid Date");
      expect(JSON.stringify(ev)).toBeTypeOf("string");
    }
  });

  it("checkpoint round-trip via JSON preserves dedupe behaviour", () => {
    const first = runAlertEngine({
      context: ctx(),
      checkpoint: emptyCheckpoint("u1", "2026-07-17T04:30:00.000Z"),
      subscription: defaultSubscription("u1"),
    });
    const roundTripped = JSON.parse(JSON.stringify(first.nextCheckpoint));
    const second = runAlertEngine({
      context: ctx("2026-07-17T04:31:00.000Z"),
      checkpoint: roundTripped,
      subscription: defaultSubscription("u1"),
    });
    expect(second.emitted.length).toBe(0);
  });
});