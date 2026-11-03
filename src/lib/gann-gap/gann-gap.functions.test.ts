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

import { getGannGapOutlook } from "./gann-gap.functions";

const call = (fn: unknown) => fn as (arg: unknown) => Promise<unknown>;

describe("getGannGapOutlook — authentication gate", () => {
  beforeEach(() => {
    assertAuthMock.mockReset();
  });

  it("rejects anonymous callers before any outlook computation runs", async () => {
    assertAuthMock.mockImplementation(realishAssertAuth);
    await expect(call(getGannGapOutlook)({ context: { userId: null }, data: {} })).rejects.toThrow(
      "Unauthorized: Authentication required",
    );
    expect(assertAuthMock).toHaveBeenCalledTimes(1);
  });

  it("lets authenticated users past the gate (existing authorized behavior preserved)", async () => {
    assertAuthMock.mockImplementation((ctx: { userId: string | null }) => {
      realishAssertAuth(ctx);
      throw new Error("__AUTH_GATE_PASSED__");
    });
    await expect(
      call(getGannGapOutlook)({ context: { userId: "user-123" }, data: {} }),
    ).rejects.toThrow("__AUTH_GATE_PASSED__");
  });
});

const marketRead = vi.hoisted(() => vi.fn());
vi.mock("@/lib/market.functions", () => ({ getMarketData: marketRead }));
vi.mock("@/lib/feature-flags", () => ({ findFeatureFlag: vi.fn(() => ({ enabled: true })) }));
vi.mock("@/lib/gti-summary/gti-summary.functions", () => ({
  getGtiSummary: vi.fn(async () => null),
}));
vi.mock("@/lib/decision.functions", () => ({ getDecisionSnapshot: vi.fn(async () => null) }));
import { afterEach } from "vitest";
import { findFeatureFlag } from "@/lib/feature-flags";
import { generateGannGapLevels } from "./levels";
import { DEFAULT_GANN_GAP_CONFIG } from "./config";

describe("Gann Gap authorized snapshot", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-14T11:00:00Z"));
    assertAuthMock.mockReset().mockImplementation(realishAssertAuth);
    marketRead
      .mockReset()
      .mockResolvedValue({ nifty: { prevDay: { close: 25180 }, livePrice: 25200 } });
    vi.mocked(findFeatureFlag).mockClear();
  });
  afterEach(() => vi.useRealTimers());
  it("rejects anonymous access before feature checks or market reads", async () => {
    await expect(call(getGannGapOutlook)({ context: { userId: null } })).rejects.toThrow(
      "Unauthorized",
    );
    expect(findFeatureFlag).not.toHaveBeenCalled();
    expect(marketRead).not.toHaveBeenCalled();
  });
  it("returns canonical reference and unchanged level geometry for authorized users", async () => {
    const result = await call(getGannGapOutlook)({ context: { userId: "user-123" } });
    expect(result).toMatchObject({
      reference: 25180,
      featureEnabled: true,
      observedAt: "2026-10-14T11:00:00.000Z",
      levels: generateGannGapLevels({
        reference: 25180,
        below: DEFAULT_GANN_GAP_CONFIG.levelsBelow,
        above: DEFAULT_GANN_GAP_CONFIG.levelsAbove,
      }),
      confirmations: expect.any(Array),
      reasons: expect.any(Array),
      formulaVersion: expect.any(String),
      configVersion: expect.any(String),
    });
    expect(marketRead).toHaveBeenCalledTimes(1);
  });
});
