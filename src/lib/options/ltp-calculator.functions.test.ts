import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { clearServerCache } from "../server-cache";
import { calculatorUnderlying } from "../chart/ltp-overlay";

vi.mock("@tanstack/react-start", () => ({ createServerFn: () => ({
  inputValidator: (validate: (raw: unknown) => unknown) => ({
    handler: (handler: (arg: unknown) => unknown) => (arg: { data: unknown }) => handler({ data: validate(arg.data) }),
  }),
}) }));
const provider = vi.hoisted(() => ({ canonical: vi.fn(), process: vi.fn(), fourLine: vi.fn(), quotes: vi.fn() }));
vi.mock("../option-chain/canonical-snapshot.server", () => ({ fetchCanonicalOptionChain: provider.canonical }));
vi.mock("./ltp-calculator-engine.server", () => ({
  processOptionChainToLtpCalculator: provider.process,
  generateMultiAssetOptionChainSnapshot: () => { throw new Error("Unexpected calibrated fallback in canonical snapshot test"); },
  getUpcomingWeeklyExpiries: () => ["2026-11-17"], getNseMonthlyExpiries: () => [{ dateStr: "2026-11-24" }],
  isFoStock: (symbol: string) => symbol === "RELIANCE", computeStockFourLine: provider.fourLine,
}));
vi.mock("../cycles/cycle-performance.server", () => ({ FO_UNIVERSE: [{ symbol: "RELIANCE" }] }));
vi.mock("../cycles/market-data-adapter.server", () => ({ fetchLiveQuotesBatch: provider.quotes, getCachedMarketData: () => ({ ltp: 1410 }) }));
import { getLtpCalculatorData, getStockFourLineData, ltpCalculatorQuery, stockFourLineQuery } from "./ltp-calculator.functions";

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-16T05:30:00Z")); clearServerCache();
  provider.canonical.mockReset().mockImplementation(async (input: { underlying: string; expiry?: string }) => ({
    ok: true, snapshot: { underlying: input.underlying, expiry: input.expiry ?? "2026-11-17", provider: "UPSTOX", dataQuality: "OK",
      strikes: [{ strike: 25200 }], availableExpiries: ["2026-11-17","2026-11-24"] },
  }));
  provider.process.mockReset().mockImplementation((snapshot: { underlying: string }) => ({ underlying: snapshot.underlying,
    reversalLevels: { eos: 25121.85, eor: 25364.50, maxPainSl: 25091.05 }, coaScenario: { scenarioId: 7 } }));
  provider.fourLine.mockReset().mockReturnValue({ p2: 1482.85, p1: 1461.15, c1: 1418.45, c2: 1397.65 });
  provider.quotes.mockReset().mockResolvedValue(undefined);
});
afterEach(() => { clearServerCache(); vi.clearAllTimers(); vi.useRealTimers(); });

describe("shared calculator snapshots", () => {
  it("serves the identical snapshot to concurrent chart/calculator callers and refreshes after 15 seconds", async () => {
    const [chart, calculator] = await Promise.all([
      getLtpCalculatorData({ data: { underlying: calculatorUnderlying("NIFTY50") } }),
      getLtpCalculatorData({ data: { underlying: "NIFTY" } }),
    ]);
    expect(chart).toBe(calculator);
    expect(chart.data?.reversalLevels.eos).toBe(25121.85);
    expect(provider.canonical).toHaveBeenCalledTimes(1);
    expect(provider.process).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(15001);
    await getLtpCalculatorData({ data: { underlying: "NIFTY" } });
    expect(provider.canonical).toHaveBeenCalledTimes(2);
  });
  it("keeps symbols and expiries isolated and preserves the existing query namespace", async () => {
    await getLtpCalculatorData({ data: { underlying: "NIFTY" } });
    await getLtpCalculatorData({ data: { underlying: "BANKNIFTY" } });
    await getLtpCalculatorData({ data: { underlying: "NIFTY", expiry: "2026-11-24" } });
    expect(provider.canonical).toHaveBeenCalledTimes(3);
    expect(ltpCalculatorQuery({ underlying: calculatorUnderlying("NIFTY50") }).queryKey).toEqual(["ltp-calculator","NIFTY","auto"]);
    expect(ltpCalculatorQuery({ underlying: "NIFTY" }).refetchInterval).toBe(15000);
  });
  it("shares exact stock four-line results between both pages without changing the stock engine", async () => {
    const first = await getStockFourLineData({ data: { symbol: "RELIANCE" } });
    const second = await getStockFourLineData({ data: { symbol: "RELIANCE" } });
    expect(first).toBe(second);
    expect(first.fourLine?.p2).toBe(1482.85);
    expect(provider.fourLine).toHaveBeenCalledTimes(1);
    expect(stockFourLineQuery("RELIANCE").refetchInterval).toBe(15000);
  });
});
