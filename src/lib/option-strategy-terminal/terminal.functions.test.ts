import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tanstack/react-start", () => {
  const chain = (): unknown => ({
    middleware: () => chain(),
    validator: () => chain(),
    inputValidator: () => chain(),
    handler: (fn: unknown) => fn,
  });
  return { createServerFn: () => chain() };
});

const { assertAuthMock } = vi.hoisted(() => ({ assertAuthMock: vi.fn() }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({
  requireSupabaseAuth: "requireSupabaseAuth",
  assertAuth: assertAuthMock,
}));

function realishAssertAuth(ctx: { userId: string | null }) {
  if (!ctx.userId) throw new Error("Unauthorized: Authentication required");
}

import { getOptionStrategyTerminal } from "./terminal.functions";

const call = (fn: unknown) => fn as (arg: unknown) => Promise<unknown>;

describe("getOptionStrategyTerminal — authentication gate", () => {
  beforeEach(() => {
    assertAuthMock.mockReset();
  });

  it("rejects anonymous callers before any terminal computation runs", async () => {
    assertAuthMock.mockImplementation(realishAssertAuth);
    await expect(
      call(getOptionStrategyTerminal)({ context: { userId: null }, data: {} }),
    ).rejects.toThrow("Unauthorized: Authentication required");
    expect(assertAuthMock).toHaveBeenCalledTimes(1);
  });

  it("lets authenticated users past the gate (existing authorized behavior preserved)", async () => {
    assertAuthMock.mockImplementation((ctx: { userId: string | null }) => {
      realishAssertAuth(ctx);
      throw new Error("__AUTH_GATE_PASSED__");
    });
    await expect(
      call(getOptionStrategyTerminal)({ context: { userId: "user-123" }, data: {} }),
    ).rejects.toThrow("__AUTH_GATE_PASSED__");
  });
});

const upstream = vi.hoisted(() => ({
  decision: vi.fn(),
  gti: vi.fn(),
  gap: vi.fn(),
  extra: vi.fn(),
}));
vi.mock("@/lib/decision.functions", () => ({ getDecisionSnapshot: upstream.decision }));
vi.mock("@/lib/gti-summary/gti-summary.functions", () => ({ getGtiSummary: upstream.gti }));
vi.mock("@/lib/gann-gap/gann-gap.functions", () => ({ getGannGapOutlook: upstream.gap }));
vi.mock("@/lib/institutional-flow/institutional-flow.functions", () => ({
  getInstitutionalFlow: upstream.extra,
}));

describe("Authorized aggregation compatibility", () => {
  beforeEach(() => {
    assertAuthMock.mockReset().mockImplementation(realishAssertAuth);
    for (const mock of Object.values(upstream)) mock.mockReset();
    upstream.decision.mockResolvedValue({
      decision: {
        action: "BUY_CE",
        regime: "TREND",
        confidence: 0.72,
        contributions: ["astro", "pcr", "breadth"].map((key) => ({
          key,
          present: true,
          bias: "BULL",
        })),
      },
      context: { vix: 14.2 },
      capabilities: { pcrCombined: { direction: "BULLISH", combinedScore: 0.4, pcrOi: 1.1 } },
    });
    upstream.gti.mockResolvedValue({
      gti: { state: "BULLISH", confidence: 72 },
      vix: { value: 14.2, regime: "MID" },
      breadthState: "BULLISH",
      source: "LIVE",
    });
    upstream.gap.mockResolvedValue({
      lifecycle: "FROZEN",
      label: "GAP_UP_RESEARCH",
      source: "MIXED",
    });
    upstream.extra.mockRejectedValue(new Error("offline optional source unavailable"));
  });
  it("rejects anonymous callers without any upstream reads", async () => {
    await expect(call(getOptionStrategyTerminal)({ context: { userId: null } })).rejects.toThrow(
      "Unauthorized",
    );
    for (const mock of Object.values(upstream)) expect(mock).not.toHaveBeenCalled();
  });
  it("returns the authorized analytical envelope from canonical fixtures", async () => {
    const result = await call(getOptionStrategyTerminal)({ context: { userId: "user-123" } });
    expect(result).toMatchObject({
      source: "LIVE",
      signals: {
        decision: "BULLISH",
        pcr: "BULLISH",
        gti: "BULLISH",
        gannGap: "BULLISH",
        decisionConfidence: 72,
      },
      evidence: { decision: { available: true, action: "BUY_CE", confidence: 0.72 } },
      engine: { recommended: expect.any(Array) },
      generatedAt: expect.any(String),
    });
    expect(Object.keys(result as object).sort()).toEqual([
      "decisionEngine",
      "disclaimer",
      "engine",
      "evidence",
      "generatedAt",
      "institutionalFlowEngine",
      "signals",
      "source",
    ]);
    for (const mock of Object.values(upstream)) expect(mock).toHaveBeenCalledTimes(1);
  });
});
