import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getDeepMultiTimeframeCandles, buildDeepHistoryPlan } from "./upstox-historical-deep.server";

const provider = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("./upstox-http.server", () => ({ UpstoxHttpClient: class { request = provider.request; } }));
const today = "2026-11-16";
const candle = (time: number, price: number) => [new Date(time).toISOString(), price, price + 2, price - 1, price + 1, 100, 0];
const live = Array.from({ length: 61 }, (_, i) => candle(Date.parse(`${today}T09:15:00+05:30`) + i * 60000, 200));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${today}T10:15:00+05:30`));
  provider.request.mockReset().mockImplementation(async ({ path }: { path: string }) => {
    if (path.includes("/intraday/")) return { ok: true, data: { data: { candles: live } } };
    const parts = path.split("/");
    const unit = parts[3];
    const minuteStep = Number(parts[4]);
    const from = Date.parse(`${parts[6]}T00:00:00Z`);
    const to = Date.parse(`${parts[5]}T00:00:00Z`);
    const candles: unknown[][] = [];
    for (let day = from; day <= to; day += 86400000) {
      const weekday = new Date(day).getUTCDay();
      if (weekday === 0 || weekday === 6 || (unit === "weeks" && weekday !== 1)) continue;
      const date = new Date(day).toISOString().slice(0, 10);
      if (unit !== "minutes") candles.push(candle(Date.parse(`${date}T00:00:00+05:30`), 100));
      else for (let minute = 0; minute < 375; minute += minuteStep)
        candles.push(candle(Date.parse(`${date}T09:15:00+05:30`) + minute * 60000, 100));
    }
    return { ok: true, data: { data: { candles: candles.reverse() } } };
  });
});
afterEach(() => vi.useRealTimers());

describe("deep historical/current-session stitching", () => {
  it.each([60000, 180000, 300000, 900000, 1800000, 3600000, 14400000, 86400000, 604800000])("loads 250–500 authentic-shape multi-session bars at %i ms", async (interval) => {
    const result = await getDeepMultiTimeframeCandles("NIFTY50", interval);
    expect(result.candles.length).toBeGreaterThanOrEqual(250);
    expect(result.candles.length).toBeLessThanOrEqual(500);
    expect(result.provider).toBe("UPSTOX_V3_DEEP");
    expect(result.warning).toBeUndefined();
    expect(result.candles.at(-1)?.y[3]).toBe(201);
    expect(result.candles[0].x).toBeLessThan(Date.parse(`${today}T00:00:00+05:30`));
    expect(new Set(result.candles.map((c) => c.x)).size).toBe(result.candles.length);
    expect(result.candles.every((c, i, all) => i === 0 || c.x > all[i - 1].x)).toBe(true);
    expect(provider.request).toHaveBeenCalledWith({ path: expect.stringContaining("/intraday/NSE_INDEX%7CNifty%2050/minutes/1") });
    const requestCount = provider.request.mock.calls.length;
    await getDeepMultiTimeframeCandles("NIFTY50", interval);
    expect(provider.request).toHaveBeenCalledTimes(requestCount);
  });

  it("preserves the exact 09:15-to-current-minute one-minute sequence", async () => {
    const result = await getDeepMultiTimeframeCandles("BANKNIFTY", 60000);
    const session = result.candles.filter((c) => c.x >= Date.parse(`${today}T00:00:00+05:30`));
    expect(session.map((c) => c.x)).toEqual(live.map((c) => Date.parse(String(c[0]))));
    expect(result.candles).toHaveLength(500);
  });

  it("chunks requests inside provider limits and uses IST dates across UTC midnight", async () => {
    for (const interval of [60000, 900000, 3600000, 14400000]) {
      const plan = buildDeepHistoryPlan(interval, Date.parse("2026-11-15T20:00:00Z"));
      expect(plan.today).toBe(today);
      expect(plan.chunks[0].to).toBe("2026-11-15");
      for (const chunk of plan.chunks) expect((Date.parse(chunk.to) - Date.parse(chunk.from)) / 86400000).toBeLessThan(plan.interval === 1 ? 28 : 88);
      for (let i = 1; i < plan.chunks.length; i++) expect(Date.parse(plan.chunks[i - 1].from) - Date.parse(plan.chunks[i].to)).toBe(86400000);
    }
  });

  it("reports incomplete history instead of fabricating bars when only today's endpoint works", async () => {
    provider.request.mockImplementation(async ({ path }: { path: string }) => path.includes("/intraday/")
      ? { ok: true, data: { data: { candles: live } } } : { ok: false });
    const result = await getDeepMultiTimeframeCandles("NIFTY", 60000);
    expect(result.candles).toHaveLength(61);
    expect(result.warning).toContain("limited history");
  });
  it("coalesces concurrent bootstraps and allows reconnects to bypass the completed snapshot cache", async () => {
    const [first, second] = await Promise.all([
      getDeepMultiTimeframeCandles("NIFTY BANK", 60000, true),
      getDeepMultiTimeframeCandles("NIFTY BANK", 60000, true),
    ]);
    expect(first).toBe(second);
    expect(provider.request).toHaveBeenCalledTimes(2);
    await getDeepMultiTimeframeCandles("NIFTY BANK", 60000);
    expect(provider.request).toHaveBeenCalledTimes(2);
    await getDeepMultiTimeframeCandles("NIFTY BANK", 60000, true);
    expect(provider.request).toHaveBeenCalledTimes(4);
  });
});
