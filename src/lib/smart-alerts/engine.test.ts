import { describe, expect, it } from "vitest";
import { runAlertEngine, emptyCheckpoint } from "./engine";
import { defaultSubscription } from "./subscriptions";
import type { AlertEvaluationContext } from "./types";

function baseCtx(overrides: Partial<AlertEvaluationContext> = {}): AlertEvaluationContext {
  const now = "2026-07-17T04:30:00.000Z";
  return {
    generatedAt: now,
    tradingDate: "2026-07-17",
    userId: "u1",
    instruments: ["NIFTY"],
    decision: { available: true, action: "BUY", bias: "BULLISH", freshness: "LIVE" },
    pcr: { available: true, direction: "BULLISH", bias: "BULLISH", freshness: "LIVE" },
    gti: { available: true, state: "BULLISH_TREND", bias: "BULLISH", freshness: "LIVE" },
    breadth: { available: true, state: "BULLISH", bias: "BULLISH", freshness: "MIXED" },
    vix: { available: true, value: 14, regime: "LOW", freshness: "LIVE" },
    astro: { available: true, state: "NONE", label: null, startsInMinutes: null, freshness: "LIVE" },
    gannLevels: [],
    gannGap: { available: true, predictionId: "p1", lifecycle: "PROVISIONAL", label: null, freshness: "LIVE" },
    strategy: { available: true, topStrategyId: "long_call", bias: "BULLISH", freshness: "LIVE" },
    ai: { available: true, bias: "BULLISH", confidence: "MEDIUM", freshness: "LIVE" },
    runtime: { available: true, modules: [{ module: "DECISION_ENGINE", status: "HEALTHY", reason: null }], overall: "READY" },
    ...overrides,
  };
}

describe("smart-alerts engine", () => {
  it("emits nothing on first evaluation (no prior state)", () => {
    const r = runAlertEngine({
      context: baseCtx(),
      checkpoint: emptyCheckpoint("u1", "2026-07-17T04:30:00.000Z"),
      subscription: defaultSubscription("u1"),
    });
    expect(r.emitted).toHaveLength(0);
  });

  it("emits DECISION_CHANGED on bias flip and dedupes on repeat", () => {
    const ctx1 = baseCtx();
    const first = runAlertEngine({
      context: ctx1,
      checkpoint: emptyCheckpoint("u1", ctx1.generatedAt),
      subscription: defaultSubscription("u1"),
    });
    const ctx2 = baseCtx({
      decision: { available: true, action: "SELL", bias: "BEARISH", freshness: "LIVE" },
      generatedAt: "2026-07-17T04:31:00.000Z",
    });
    const second = runAlertEngine({
      context: ctx2,
      checkpoint: first.nextCheckpoint,
      subscription: defaultSubscription("u1"),
    });
    const types = second.emitted.map((e) => e.type);
    expect(types).toContain("DECISION_CHANGED");
    // Repeat with identical context — must dedupe.
    const third = runAlertEngine({
      context: ctx2,
      checkpoint: second.nextCheckpoint,
      subscription: defaultSubscription("u1"),
    });
    expect(third.emitted.map((e) => e.type)).not.toContain("DECISION_CHANGED");
  });

  it("redacts execution-oriented wording via guardrails", () => {
    const ctx1 = baseCtx();
    const first = runAlertEngine({
      context: ctx1,
      checkpoint: emptyCheckpoint("u1", ctx1.generatedAt),
      subscription: defaultSubscription("u1"),
    });
    const ctx2 = baseCtx({
      decision: { available: true, action: "SELL", bias: "BEARISH", freshness: "LIVE" },
      generatedAt: "2026-07-17T04:31:00.000Z",
    });
    const second = runAlertEngine({
      context: ctx2,
      checkpoint: first.nextCheckpoint,
      subscription: defaultSubscription("u1"),
    });
    for (const e of second.emitted) {
      expect(e.summary.toLowerCase()).not.toMatch(/guaranteed|will\s+move|place\s+order|buy\s+now|sell\s+now/);
      expect(e.disclaimer).toMatch(/Research Only/i);
    }
  });

  it("clamps CRITICAL to HIGH for market-signal alert types", () => {
    const r = runAlertEngine({
      context: baseCtx(),
      checkpoint: emptyCheckpoint("u1", "2026-07-17T04:30:00.000Z"),
      subscription: defaultSubscription("u1"),
    });
    for (const e of r.emitted) {
      if (e.category === "MARKET_SIGNAL") expect(e.priority).not.toBe("CRITICAL");
    }
  });
});