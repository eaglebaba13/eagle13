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

import { getCollectorGoldSilverRatio } from "./tradingview.functions";

const call = (fn: unknown) => fn as (arg: unknown) => Promise<unknown>;

describe("getCollectorGoldSilverRatio — authentication gate", () => {
  beforeEach(() => {
    assertAuthMock.mockReset();
  });

  it("rejects anonymous callers before any collector request runs", async () => {
    assertAuthMock.mockImplementation(realishAssertAuth);
    await expect(
      call(getCollectorGoldSilverRatio)({ context: { userId: null }, data: {} }),
    ).rejects.toThrow("Unauthorized: Authentication required");
    expect(assertAuthMock).toHaveBeenCalledTimes(1);
  });

  it("lets authenticated users past the gate (existing authorized behavior preserved)", async () => {
    assertAuthMock.mockImplementation((ctx: { userId: string | null }) => {
      realishAssertAuth(ctx);
      throw new Error("__AUTH_GATE_PASSED__");
    });
    await expect(
      call(getCollectorGoldSilverRatio)({ context: { userId: "user-123" }, data: {} }),
    ).rejects.toThrow("__AUTH_GATE_PASSED__");
  });
});

import { getTradingViewDiagnostics } from "./tradingview.functions";
import { buildSnapshot } from "./snapshot-contract";
const collector = vi.hoisted(() => ({ snapshot: vi.fn(), config: vi.fn(), diagnostics: vi.fn() }));
vi.mock("./collector-client.server", () => ({
  getGoldSilverRatioSnapshot: collector.snapshot,
  readCollectorConfig: collector.config,
  getCollectorDiagnostics: collector.diagnostics,
}));

describe("TradingView snapshot and admin authorization", () => {
  const rpc = vi.fn();
  const snapshot = buildSnapshot({
    symbol: "TVC:GOLDSILVER",
    ratio: 78.4,
    marketTimestamp: 1791972000,
    receivedAtMs: 1791972000000,
    now: 1791972000000,
    connectionStatus: "CONNECTED",
  });
  beforeEach(() => {
    assertAuthMock.mockReset().mockImplementation(realishAssertAuth);
    rpc.mockReset();
    collector.snapshot.mockReset().mockResolvedValue(snapshot);
    collector.config.mockReset().mockReturnValue({
      enabled: false,
      urlConfigured: false,
      tokenConfigured: false,
      tokenMasked: null,
      baseUrl: null,
    });
    collector.diagnostics.mockReset().mockReturnValue({
      lastFetchAt: null,
      lastSuccessAt: null,
      lastFailureReason: null,
      cacheAgeMs: null,
    });
  });
  it("rejects anonymous snapshots without collector access", async () => {
    await expect(call(getCollectorGoldSilverRatio)({ context: { userId: null } })).rejects.toThrow(
      "Unauthorized",
    );
    expect(collector.snapshot).not.toHaveBeenCalled();
  });
  it("returns the collector snapshot unchanged for authorized users", async () => {
    expect(await call(getCollectorGoldSilverRatio)({ context: { userId: "user-123" } })).toBe(
      snapshot,
    );
    expect(collector.snapshot).toHaveBeenCalledTimes(1);
  });
  it("rejects anonymous diagnostics before RPC or collector access", async () => {
    await expect(
      call(getTradingViewDiagnostics)({ context: { userId: null, supabase: { rpc } } }),
    ).rejects.toThrow("Unauthorized");
    expect(rpc).not.toHaveBeenCalled();
    expect(collector.config).not.toHaveBeenCalled();
    expect(collector.snapshot).not.toHaveBeenCalled();
    expect(collector.diagnostics).not.toHaveBeenCalled();
  });
  it("denies authenticated non-admin users before collector access", async () => {
    rpc.mockResolvedValue({ data: false });
    await expect(
      call(getTradingViewDiagnostics)({ context: { userId: "user-123", supabase: { rpc } } }),
    ).rejects.toThrow("forbidden");
    expect(rpc).toHaveBeenCalledWith("has_role", { _user_id: "user-123", _role: "admin" });
    expect(collector.config).not.toHaveBeenCalled();
    expect(collector.snapshot).not.toHaveBeenCalled();
  });
  it.each([
    { data: null, error: null },
    { data: "true", error: null },
    { data: true, error: { message: "offline role verification failure" } },
  ])("fails closed unless admin verification succeeds with exactly true", async (response) => {
    rpc.mockResolvedValue(response);
    await expect(
      call(getTradingViewDiagnostics)({ context: { userId: "user-123", supabase: { rpc } } }),
    ).rejects.toThrow("forbidden");
    expect(collector.config).not.toHaveBeenCalled();
    expect(collector.snapshot).not.toHaveBeenCalled();
    expect(collector.diagnostics).not.toHaveBeenCalled();
  });
  it("supports authorized admin diagnostics with the existing disabled-collector payload", async () => {
    rpc.mockResolvedValue({ data: true });
    const result = await call(getTradingViewDiagnostics)({
      context: { userId: "admin-123", supabase: { rpc } },
    });
    expect(rpc).toHaveBeenCalledWith("has_role", { _user_id: "admin-123", _role: "admin" });
    expect(result).toMatchObject({
      symbol: "TVC:GOLDSILVER",
      collector: { enabled: false, tokenMasked: null },
      snapshot: { ratio: null, connectionStatus: "DISABLED" },
      health: null,
      healthError: null,
      cacheAgeMs: null,
    });
    expect(collector.diagnostics).toHaveBeenCalledTimes(1);
    expect(collector.snapshot).not.toHaveBeenCalled();
  });
});
