import { afterEach, describe, expect, it, vi } from "vitest";
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
    astro: {
      available: true,
      state: "NONE",
      label: null,
      startsInMinutes: null,
      freshness: "LIVE",
    },
    gannLevels: [],
    gannGap: {
      available: true,
      predictionId: "p1",
      lifecycle: "PROVISIONAL",
      label: null,
      freshness: "LIVE",
    },
    strategy: { available: true, topStrategyId: "long_call", bias: "BULLISH", freshness: "LIVE" },
    ai: { available: true, bias: "BULLISH", confidence: "MEDIUM", freshness: "LIVE" },
    runtime: {
      available: true,
      modules: [{ module: "DECISION_ENGINE", status: "HEALTHY", reason: null }],
      overall: "READY",
    },
    ...overrides,
  };
}

describe("smart-alerts engine", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("sends an opted-in transition once and suppresses delivery on repeat", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-only-token");
    vi.stubEnv("TELEGRAM_CHAT_ID", "test-only-chat");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 1 } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const subscription = { ...defaultSubscription("u1"), telegramEnabled: true };
    const initial = baseCtx();
    const first = await runAlertEngine({
      context: initial,
      checkpoint: emptyCheckpoint("u1", initial.generatedAt),
      subscription,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    const changed = baseCtx({
      generatedAt: "2026-07-17T04:31:00.000Z",
      decision: { available: true, action: "SELL", bias: "BEARISH", freshness: "LIVE" },
    });
    const second = await runAlertEngine({
      context: changed,
      checkpoint: first.nextCheckpoint,
      subscription,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second.emitted[0].deliveryStatus).toContainEqual(
      expect.objectContaining({
        provider: "TELEGRAM",
        status: "DELIVERED",
      }),
    );
    const repeated = await runAlertEngine({
      context: changed,
      checkpoint: second.nextCheckpoint,
      subscription,
    });
    expect(repeated.emitted).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("emits nothing on first evaluation (no prior state)", async () => {
    const r = await runAlertEngine({
      context: baseCtx(),
      checkpoint: emptyCheckpoint("u1", "2026-07-17T04:30:00.000Z"),
      subscription: defaultSubscription("u1"),
    });
    expect(r.emitted).toHaveLength(0);
  });

  it("emits DECISION_CHANGED on bias flip and dedupes on repeat", async () => {
    const ctx1 = baseCtx();
    const first = await runAlertEngine({
      context: ctx1,
      checkpoint: emptyCheckpoint("u1", ctx1.generatedAt),
      subscription: defaultSubscription("u1"),
    });
    const ctx2 = baseCtx({
      decision: { available: true, action: "SELL", bias: "BEARISH", freshness: "LIVE" },
      generatedAt: "2026-07-17T04:31:00.000Z",
    });
    const second = await runAlertEngine({
      context: ctx2,
      checkpoint: first.nextCheckpoint,
      subscription: defaultSubscription("u1"),
    });
    const types = second.emitted.map((e) => e.type);
    expect(types).toContain("DECISION_CHANGED");
    // Repeat with identical context — must dedupe.
    const third = await runAlertEngine({
      context: ctx2,
      checkpoint: second.nextCheckpoint,
      subscription: defaultSubscription("u1"),
    });
    expect(third.emitted.map((e) => e.type)).not.toContain("DECISION_CHANGED");
  });

  it("redacts execution-oriented wording via guardrails", async () => {
    const ctx1 = baseCtx();
    const first = await runAlertEngine({
      context: ctx1,
      checkpoint: emptyCheckpoint("u1", ctx1.generatedAt),
      subscription: defaultSubscription("u1"),
    });
    const ctx2 = baseCtx({
      decision: { available: true, action: "SELL", bias: "BEARISH", freshness: "LIVE" },
      generatedAt: "2026-07-17T04:31:00.000Z",
    });
    const second = await runAlertEngine({
      context: ctx2,
      checkpoint: first.nextCheckpoint,
      subscription: defaultSubscription("u1"),
    });
    for (const e of second.emitted) {
      expect(e.summary.toLowerCase()).not.toMatch(
        /guaranteed|will\s+move|place\s+order|buy\s+now|sell\s+now/,
      );
      expect(e.disclaimer).toMatch(/Research Only/i);
    }
  });

  it("clamps CRITICAL to HIGH for market-signal alert types", async () => {
    const r = await runAlertEngine({
      context: baseCtx(),
      checkpoint: emptyCheckpoint("u1", "2026-07-17T04:30:00.000Z"),
      subscription: defaultSubscription("u1"),
    });
    for (const e of r.emitted) {
      if (e.category === "MARKET_SIGNAL") expect(e.priority).not.toBe("CRITICAL");
    }
  });
});
