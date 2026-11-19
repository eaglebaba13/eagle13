import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import dailyFixture from "./ht-gann-daily-oct-2024.fixture.json";
import { fetchIndexDailyData, getHTGannIntra, type HTGannIntraPayload } from "../ht-gann-intra.functions";

const provider = vi.hoisted(() => ({ request: vi.fn(), quote: vi.fn() }));
vi.mock("../provider-foundation/upstox/upstox-http.server", () => ({
  UpstoxHttpClient: class { request = provider.request; },
}));
vi.mock("../provider-foundation/upstox/upstox-historical.adapter.server", () => ({
  UpstoxHistoricalAdapter: class { fetchQuote = provider.quote; },
}));
vi.mock("../server-cache", () => ({ cached: (_key: string, load: () => unknown) => load() }));
vi.mock("../http", () => ({ fetchJson: async () => { throw new Error("VIX unavailable in fixture"); } }));
vi.mock("@tanstack/react-start", () => ({
  createServerOnlyFn: (fn: unknown) => fn,
  createServerFn: () => ({ validator: (validate: (input: unknown) => unknown) => ({
    handler: (fn: (arg: unknown) => unknown) => (arg: { data: unknown }) => fn({ data: validate(arg.data) }),
  }) }),
}));
import {
  computeFloorPivots,
  computeHtGannIntraV2Matrix,
  evaluatePillar2Starwise,
  evaluatePillar3Retrograde,
  evaluatePillar4Aspects,
  evaluateMasterCube,
  EMPIRICAL_18_ASPECTS,
  NAKSHATRA_DOMINANCE_MAP,
  type PlanetPositionInput,
} from "./ht-gann-intra-v2";

describe("HT Gann Intra V2 & 4-Pillar Cube Engine", () => {
  const samplePlanets: PlanetPositionInput[] = [
    { name: "Sun", absDegree: 215.2, retro: false },
    { name: "Moon", absDegree: 45.5, retro: false },
    { name: "Mars", absDegree: 105.1, retro: true, speed: -0.2 },
    { name: "Mercury", absDegree: 242.8, retro: false },
    { name: "Jupiter", absDegree: 75.3, retro: false },
    { name: "Venus", absDegree: 260.0, retro: false },
    { name: "Saturn", absDegree: 340.4, retro: false },
    { name: "Rahu", absDegree: 35.0, retro: true, speed: -0.05 },
    { name: "Ketu", absDegree: 215.0, retro: true, speed: -0.05 },
  ];

  describe("Pillar 1: Intraday 360° Matrix & Floor Pivots", () => {
    it("computes exact floor pivots (P, R1, S1, R2, S2, R3, S3)", () => {
      const pivots = computeFloorPivots(25200, 25000, 25100);
      expect(pivots.P).toBe(25100);
      expect(pivots.R1).toBe(25200); // 2*P - low = 50200 - 25000 = 25200
      expect(pivots.S1).toBe(25000); // 2*P - high = 50200 - 25200 = 25000
      expect(pivots.R2).toBe(25300); // P + (H - L) = 25100 + 200 = 25300
      expect(pivots.S2).toBe(24900); // P - (H - L) = 25100 - 200 = 24900
      expect(pivots.R3).toBe(25400); // H + 2*(P - L) = 25200 + 200 = 25400
      expect(pivots.S3).toBe(24800); // L - 2*(H - P) = 25000 - 200 = 24800
    });

    it("computes 36-level matrix for NIFTY with correct 360° cycle bounds", () => {
      const prevClose = 25144.3;
      const res = computeHtGannIntraV2Matrix({
        symbol: "NIFTY",
        prevClose,
        planets: samplePlanets,
        ohlc: { high: 25250, low: 25050, close: 25144.3 },
        indiaVix: 13.5,
      });

      expect(res.symbol).toBe("NIFTY");
      expect(res.upper360).toBe(25200); // Math.ceil(25144.3 / 360) * 360 = 70 * 360
      expect(res.lower360).toBe(24840); // Math.floor(25144.3 / 360) * 360 = 69 * 360
      expect(res.safeBuffer).toBe(100);
      expect(res.safeBuyThreshold).toBeCloseTo(25044.3, 1);
      expect(res.safeSellThreshold).toBeCloseTo(25244.3, 1);
      expect(res.rows.length).toBe(9);
      expect(res.allLevelsSorted.length).toBe(36);

      // Verify Moon row
      const moonRow = res.rows.find((r) => r.planet === "Moon");
      expect(moonRow).toBeDefined();
      expect(moonRow?.isPrimaryPlanet).toBe(true);
      // L1 = round(25200 + 45.5) = 25246 -> >= 25244.3 => SAFE_SELL
      expect(moonRow?.L1.level).toBe(25246);
      expect(moonRow?.L1.safety).toBe("SAFE_SELL");
      // L2 = round(24840 + 45.5) = 24886 -> <= 25044.3 => SAFE_BUY
      expect(moonRow?.L2.level).toBe(24886);
      expect(moonRow?.L2.safety).toBe("SAFE_BUY");
      // L3 = round(25200 - 45.5) = 25155 -> between 25044.3 and 25244.3 => RISKY_INNER
      expect(moonRow?.L3.level).toBe(25155);
      expect(moonRow?.L3.safety).toBe("RISKY_INNER");
      // L4 = round(24840 - 45.5) = 24795 -> <= 25044.3 => SAFE_BUY
      expect(moonRow?.L4.level).toBe(24795);
      expect(moonRow?.L4.safety).toBe("SAFE_BUY");
    });

    it("applies 300 pt buffer for BANKNIFTY and sets 101 pt risk rules", () => {
      const res = computeHtGannIntraV2Matrix({
        symbol: "BANKNIFTY",
        prevClose: 51600,
        planets: samplePlanets,
      });

      expect(res.safeBuffer).toBe(300);
      expect(res.safeBuyThreshold).toBe(51300);
      expect(res.safeSellThreshold).toBe(51900);
      expect(res.riskRules.spotSl).toBe(101);
      expect(res.riskRules.target1).toBe(101);
    });

    it("flags dynamic EB Pivot confluence and populates explicit Trade Levels", () => {
      // Low VIX (< 15): flags S2 / R2
      const resLowVix = computeHtGannIntraV2Matrix({
        symbol: "NIFTY",
        prevClose: 25144.3,
        planets: [
          { name: "Moon", absDegree: 140 }, // L3 = 25200 - 140 = 25060 (close to S1)
          { name: "Sun", absDegree: 250 }, // L3 = 25200 - 250 = 24950 (close to S2)
        ],
        ohlc: { high: 25250, low: 25050, close: 25150 },
        indiaVix: 12.0,
      });

      const pivots = resLowVix.floorPivots!;
      expect(pivots).toBeDefined();
      const sunRow = resLowVix.rows.find((r) => r.planet === "Sun");
      expect(sunRow).toBeDefined();

      // Check primary safe buy and sell setups
      expect(resLowVix.primarySafeBuySetup).toBeDefined();
      expect(resLowVix.primarySafeBuySetup?.safety).toBe("SAFE_BUY");
      expect(resLowVix.primarySafeBuySetup?.tradeLevels).toBeDefined();
      const buyTl = resLowVix.primarySafeBuySetup!.tradeLevels!;
      expect(buyTl.riskPts).toBe(51);
      expect(buyTl.sl).toBe(buyTl.entry - 51);
      expect(buyTl.tp1).toBe(buyTl.entry + 51);
      expect(buyTl.tp2).toBe(buyTl.entry + 102);
      expect(buyTl.tp3).toBe(buyTl.entry + 153);
      expect(buyTl.recommendedStrike).toContain("CE (ITM)");

      expect(resLowVix.primarySafeSellSetup).toBeDefined();
      expect(resLowVix.primarySafeSellSetup?.safety).toBe("SAFE_SELL");
      expect(resLowVix.primarySafeSellSetup?.tradeLevels).toBeDefined();
      const sellTl = resLowVix.primarySafeSellSetup!.tradeLevels!;
      expect(sellTl.riskPts).toBe(51);
      expect(sellTl.sl).toBe(sellTl.entry + 51);
      expect(sellTl.tp1).toBe(sellTl.entry - 51);
      expect(sellTl.tp2).toBe(sellTl.entry - 102);
      expect(sellTl.tp3).toBe(sellTl.entry - 153);
      expect(sellTl.recommendedStrike).toContain("PE (ITM)");
    });
  });

  describe("Pillar 2: 27 Nakshatras & Daily RSI 14 Sync", () => {
    it("correctly identifies Bull Dominant Stars", () => {
      for (const star of ["Krittika", "Uttara Phalguni", "Chitra", "Dhanishta", "Pushya"]) {
        const res = evaluatePillar2Starwise({ moonNakshatra: star, dailyRsi14: 32 });
        expect(res.nature).toBe("BULL");
        expect(res.syncStatus).toBe("SYNCED_BULLISH");
        expect(res.badge).toBe("✅ SYNCED BULLISH");
      }
    });

    it("strictly classifies Uttara Ashadha as BEARISH (never Neutral)", () => {
      const res = evaluatePillar2Starwise({ moonNakshatra: "Uttara Ashadha", dailyRsi14: 68 });
      expect(res.nature).toBe("BEAR");
      expect(res.syncStatus).toBe("SYNCED_BEARISH");
      expect(res.badge).toBe("✅ SYNCED BEARISH");
    });

    it("flags NON_SYNC when Bull Star has RSI >= 70 or Bear Star has RSI <= 30", () => {
      const bullNonSync = evaluatePillar2Starwise({ moonNakshatra: "Pushya", dailyRsi14: 75 });
      expect(bullNonSync.syncStatus).toBe("NON_SYNC");
      expect(bullNonSync.badge).toContain("NON-SYNC");

      const bearNonSync = evaluatePillar2Starwise({ moonNakshatra: "Bharani", dailyRsi14: 25 });
      expect(bearNonSync.syncStatus).toBe("NON_SYNC");
      expect(bearNonSync.badge).toContain("NON-SYNC");
    });
  });

  describe("Pillar 3: Retrograde Cycles & Mandatory Daily EMA 13", () => {
    it("confirms Bullish Retrograde when Spot Close >= Daily EMA 13", () => {
      const res = evaluatePillar3Retrograde({
        retroPlanets: ["Mars"],
        spotClose: 25200,
        dailyEma13: 25000,
      });
      expect(res.bias).toBe("BULLISH");
      expect(res.status).toBe("ACTIVE_CONFIRMED");
      expect(res.badge).toContain("BULLISH VAKRI (Mars) CONFIRMED");
    });

    it("triggers EMA 13 EXIT SIGNAL when Spot Close < Daily EMA 13 during Bullish Retrograde", () => {
      const res = evaluatePillar3Retrograde({
        retroPlanets: ["Jupiter"],
        spotClose: 24800,
        dailyEma13: 25000,
      });
      expect(res.bias).toBe("BULLISH");
      expect(res.status).toBe("EXIT_SIGNAL");
      expect(res.badge).toContain("EMA 13 EXIT SIGNAL");
    });

    it("confirms Bearish Retrograde for Saturn when Spot Close <= Daily EMA 13", () => {
      const res = evaluatePillar3Retrograde({
        retroPlanets: ["Saturn"],
        spotClose: 24900,
        dailyEma13: 25100,
      });
      expect(res.bias).toBe("BEARISH");
      expect(res.status).toBe("ACTIVE_CONFIRMED");
      expect(res.badge).toContain("BEARISH VAKRI (Saturn) CONFIRMED");
    });
  });

  describe("Pillar 4: Empirical 18 Planet Aspect Matrix", () => {
    it("includes exactly 18 empirical aspects (5 Bullish, 13 Bearish)", () => {
      expect(EMPIRICAL_18_ASPECTS.length).toBe(18);
      const bulls = EMPIRICAL_18_ASPECTS.filter((a) => a.nature === "BULL");
      const bears = EMPIRICAL_18_ASPECTS.filter((a) => a.nature === "BEAR");
      expect(bulls.length).toBe(5);
      expect(bears.length).toBe(13);
    });

    it("detects Moon - Jupiter @ 60° within ±3° orb", () => {
      const planets: PlanetPositionInput[] = [
        { name: "Moon", absDegree: 60.5 },
        { name: "Jupiter", absDegree: 0.0 }, // separation = 60.5° (orb diff = 0.5°)
      ];
      const res = evaluatePillar4Aspects(planets);
      expect(res.activeBullishAspects.length).toBe(1);
      expect(res.activeBullishAspects[0].aspect.id).toBe("moon-jup-60");
      expect(res.totalBullHits).toBe(17);
      expect(res.netBias).toBe("BULLISH");
    });

    it("strictly excludes Rahu - Ketu opposition", () => {
      const planets: PlanetPositionInput[] = [
        { name: "Rahu", absDegree: 30.0 },
        { name: "Ketu", absDegree: 210.0 }, // exact 180° opposition
      ];
      const res = evaluatePillar4Aspects(planets);
      // Rahu-Ketu is natural opposition, excluded from trade signals
      expect(res.allEvaluations.some((e) => e.aspect.planet1 === "Rahu" && e.aspect.planet2 === "Ketu")).toBe(false);
    });
  });

  describe("Master Cube Verdict (3/4 Rule)", () => {
    it("activates 🔥 A+ CUBE SETUP when 2 positional pillars agree and an Intra Safe Confluent level exists", () => {
      const intra = computeHtGannIntraV2Matrix({
        symbol: "NIFTY",
        prevClose: 25144.3,
        planets: [
          { name: "Moon", absDegree: 214.3 }, // L3 = 25200 - 214 = 24986 (Safe Buy)
          { name: "Sun", absDegree: 40.0 },
        ],
        ohlc: { high: 25250, low: 25050, close: 25150 },
        indiaVix: 12.0,
      });

      const p2 = evaluatePillar2Starwise({ moonNakshatra: "Pushya", dailyRsi14: 30 }); // Bullish synced
      const p3 = evaluatePillar3Retrograde({ retroPlanets: ["Mars"], spotClose: 25200, dailyEma13: 25000 }); // Bullish confirmed
      const p4 = evaluatePillar4Aspects([{ name: "Moon", absDegree: 60 }, { name: "Jupiter", absDegree: 0 }]); // Bullish (Moon-Jup 60°)

      const verdict = evaluateMasterCube({
        intraMatrix: intra,
        pillar2: p2,
        pillar3: p3,
        pillar4: p4,
        targetDate: "2026-11-19T09:15:00+05:30", // Thursday (Expiry)
      });

      expect(verdict.positionalDirection).toBe("BULLISH");
      expect(verdict.positionalVotes.bullishCount).toBe(3);
      expect(verdict.isExpiryWindow).toBe(true);
    });
  });
});

describe("Target Date historical/live synchronization", () => {
  const call = getHTGannIntra as unknown as (arg: { data: { symbol: "NIFTY" | "BANKNIFTY"; date: string; customPrevClose?: number } }) => Promise<HTGannIntraPayload>;
  const success = (candles: unknown[][]) => ({ ok: true, data: { status: "success", data: { candles } } });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-16T05:00:00Z"));
    provider.request.mockReset().mockImplementation(async ({ path }: { path: string }) =>
      success(path.includes("Nifty%20Bank") ? dailyFixture.BANKNIFTY : dailyFixture.NIFTY));
    provider.quote.mockReset().mockResolvedValue({ ok: false });
  });
  afterEach(() => vi.useRealTimers());

  it.each([
    ["NIFTY", 24749.85, 24854.05, 25029.5, 24728.9, 25074.69, 41.15],
    ["BANKNIFTY", 51288.8, 52094.2, 51930.2, 51150.25, 51815.5, 51.34],
  ] as const)("%s: authentic October 2024 session, strict T-1, indicators and all 36 levels", async (symbol, close, spot, high, low, ema, rsi) => {
    const result = await call({ data: { symbol, date: "2024-10-19" } });
    expect(result).toMatchObject({ targetDate: "2024-10-19", sessionDate: "2024-10-18", prevSessionDate: "2024-10-17",
      historical: true, prevClose: close, livePrice: spot, prevHigh: high, prevLow: low, dailyEma13: ema, dailyRsi14: rsi });
    expect(provider.request).toHaveBeenCalledWith({ path: `v2/historical-candle/${encodeURIComponent(symbol === "NIFTY" ? "NSE_INDEX|Nifty 50" : "NSE_INDEX|Nifty Bank")}/day/2024-10-19/2024-07-21` });
    expect(provider.quote).not.toHaveBeenCalled();
    const expected = computeHtGannIntraV2Matrix({ symbol, prevClose: close, planets: result.planets, ohlc: { high, low, close }, indiaVix: result.indiaVix });
    expect(result.intraMatrix).toEqual(expected);
    expect(result.intraMatrix.allLevelsSorted).toHaveLength(36);
    expect(result.intraMatrix.safeBuyThreshold).toBe(close - (symbol === "NIFTY" ? 100 : 300));
    expect(result.intraMatrix.safeSellThreshold).toBe(close + (symbol === "NIFTY" ? 100 : 300));
  });

  it("uses the same target session for a trading day, weekend and holiday; ignores future rows and invalid candles", async () => {
    const friday = await fetchIndexDailyData("NIFTY", "2024-10-18");
    const sunday = await fetchIndexDailyData("NIFTY", "2024-10-20");
    expect(sunday).toEqual(friday);
    provider.request.mockResolvedValue(success([
      ["2024-10-21T00:00:00+05:30", 99999, 99999, 99999, 99999],
      ...dailyFixture.NIFTY, ["bad", 1, 2, 1, 2], null,
    ] as unknown as unknown[][]));
    expect(await fetchIndexDailyData("NIFTY", "2024-10-19")).toEqual(friday);
    provider.request.mockResolvedValue(success(dailyFixture.NIFTY.filter((c) => !String(c[0]).startsWith("2024-10-18"))));
    expect(await fetchIndexDailyData("NIFTY", "2024-10-19")).toMatchObject({ sessionDate: "2024-10-17", dateStr: "2024-10-16", prevClose: 24971.3, livePrice: 24749.85 });
  });

  it("uses live quote today with a strict T-1 anchor and completed EOD for future projections", async () => {
    const quote = { last: 24900, high: 25000, low: 24560, open: 24665, volume: 0, telemetry: { providerTime: "2024-10-18T09:59:00Z" } };
    provider.quote.mockResolvedValue({ ok: true, data: quote });
    const now = new Date("2024-10-18T10:01:00Z");
    expect(await fetchIndexDailyData("NIFTY", "2024-10-18", now)).toMatchObject({ historical: false, livePrice: 24900, prevClose: 24749.85, dateStr: "2024-10-17", sessionDate: "2024-10-18" });
    expect(await fetchIndexDailyData("NIFTY", "2025-01-01", now)).toMatchObject({ historical: false, prevClose: 24900, dateStr: "2024-10-18" });
    expect(await fetchIndexDailyData("NIFTY", "2025-01-01", new Date("2024-10-18T05:00:00Z"))).toMatchObject({ prevClose: 24749.85, dateStr: "2024-10-17" });
    expect(provider.request.mock.calls.at(-1)?.[0].path).toContain("/day/2024-10-18/2024-07-20");
  });

  it("uses the latest completed Friday as live weekend anchor without subtracting a second session", async () => {
    expect(await fetchIndexDailyData("BANKNIFTY", "2024-10-19", new Date("2024-10-19T05:00:00Z"))).toMatchObject({ historical: false, prevClose: 52094.2, dateStr: "2024-10-18" });
  });

  it("includes today's live candle in indicators when daily history has not yet published it", async () => {
    provider.request.mockResolvedValue(success(dailyFixture.NIFTY.slice(1)));
    provider.quote.mockResolvedValue({ ok: true, data: { last: 24854.05, high: 24886.2, low: 24567.65, open: 24664.95, volume: 0, telemetry: { providerTime: "2024-10-18T09:59:00Z" } } });
    const result = await fetchIndexDailyData("NIFTY", "2024-10-18", new Date("2024-10-18T10:01:00Z"));
    expect(result).toMatchObject({ prevClose: 24749.85, sessionDate: "2024-10-18", rsi14: 41.15 });
  });

  it("accepts a finite positive override only for live/future projections and resets to auto when omitted", async () => {
    vi.setSystemTime(new Date("2024-10-18T05:00:00Z"));
    const manual = await call({ data: { symbol: "NIFTY", date: "2024-10-21", customPrevClose: 26000 } });
    expect(manual).toMatchObject({ prevClose: 26000, customPrevClose: 26000 });
    const auto = await call({ data: { symbol: "NIFTY", date: "2024-10-21" } });
    expect(auto).toMatchObject({ prevClose: 24749.85, customPrevClose: null });
    expect(auto.intraMatrix.allLevelsSorted).not.toEqual(manual.intraMatrix.allLevelsSorted);
    expect((await call({ data: { symbol: "NIFTY", date: "2024-10-21", customPrevClose: Infinity } })).prevClose).toBe(24749.85);
    vi.setSystemTime(new Date("2026-11-16T05:00:00Z"));
    expect((await call({ data: { symbol: "NIFTY", date: "2024-10-19", customPrevClose: 26000 } })).prevClose).toBe(24749.85);
  });

  it("supports old daily history through V3 fallback and rejects missing or insufficient data", async () => {
    const old = dailyFixture.NIFTY.map((row) => [String(row[0]).replace("2024-", "2010-"), ...row.slice(1)]);
    provider.request.mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce(success(old));
    expect(await fetchIndexDailyData("NIFTY", "2010-10-19")).toMatchObject({ sessionDate: "2010-10-18", dateStr: "2010-10-17" });
    expect(provider.request.mock.calls[1][0].path).toContain("/days/1/2010-10-19/2010-07-21");
    provider.request.mockResolvedValue({ ok: false });
    await expect(fetchIndexDailyData("NIFTY", "2024-10-19")).rejects.toThrow("unavailable");
    provider.request.mockResolvedValue(success(dailyFixture.NIFTY.slice(0, 1)));
    await expect(fetchIndexDailyData("NIFTY", "2024-10-19")).rejects.toThrow("Insufficient");
    await expect(fetchIndexDailyData("NIFTY", "2024-02-30")).rejects.toThrow("valid YYYY-MM-DD");
  });
});
