import { describe, it, expect } from "vitest";
import {
  inferStrikeStep,
  atmStrike,
  classifyMoneyness,
  computePCR,
  interpretPcr,
  computeMaxPain,
  classifyBuildup,
  rankWriting,
  rankUnwinding,
  selectOptionsLevels,
  nearestAstroLevel,
  confluenceBand,
  confluenceTolerance,
  scoreRecommendation,
  confirmFocus,
  categorizeExpiries,
  assessDataQuality,
  type OptionLeg,
  type OptionChainSnapshot,
} from "./options-analytics";

function leg(
  strike: number,
  side: "CE" | "PE",
  oi: number,
  changeOi = 0,
  volume = 0,
  ltp = 10,
): OptionLeg {
  return { strike, side, oi, changeOi, volume, ltp, changePct: 0, iv: null, bid: null, ask: null };
}

describe("moneyness helpers", () => {
  it("infers strike step", () => {
    expect(inferStrikeStep([24000, 24050, 24100])).toBe(50);
    expect(inferStrikeStep([50000, 50100, 50200])).toBe(100);
    expect(inferStrikeStep([])).toBe(50);
  });
  it("atm is closest strike", () => {
    expect(atmStrike(24073, [24000, 24050, 24100])).toBe(24050);
  });
  it("classifies moneyness", () => {
    expect(classifyMoneyness(24050, 24073, "CE", 50)).toBe("ATM");
    expect(classifyMoneyness(24000, 24200, "CE", 50)).toBe("ITM");
    expect(classifyMoneyness(24500, 24200, "CE", 50)).toBe("OTM");
    expect(classifyMoneyness(24500, 24200, "PE", 50)).toBe("ITM");
  });
});

describe("PCR", () => {
  it("computes PCR OI and Volume", () => {
    const legs = [leg(24000, "CE", 100, 0, 50), leg(24000, "PE", 200, 0, 100)];
    const r = computePCR(legs);
    expect(r.pcrOi).toBe(2);
    expect(r.pcrVolume).toBe(2);
  });
  it("interprets PCR", () => {
    expect(interpretPcr(1.2)).toBe("Bullish");
    expect(interpretPcr(0.7)).toBe("Bearish");
    expect(interpretPcr(1.0)).toBe("Neutral");
  });
  it("guards against divide-by-zero", () => {
    expect(computePCR([leg(24000, "PE", 100)]).pcrOi).toBe(0);
  });
});

describe("Max Pain", () => {
  it("selects the min-payout strike", () => {
    // Simple symmetric chain — writers hurt least at the middle.
    const legs = [
      leg(100, "CE", 10),
      leg(110, "CE", 20),
      leg(120, "CE", 30),
      leg(100, "PE", 30),
      leg(110, "PE", 20),
      leg(120, "PE", 10),
    ];
    const r = computeMaxPain(legs);
    expect(r.strike).toBe(110);
    expect(r.table.length).toBe(3);
  });
  it("is deterministic", () => {
    const legs = [leg(100, "CE", 5), leg(200, "PE", 5)];
    expect(computeMaxPain(legs).strike).toBe(computeMaxPain(legs).strike);
  });
});

describe("Build-up classification", () => {
  it("classifies all four quadrants", () => {
    expect(classifyBuildup(10, 12, 100, 120)).toBe("LONG_BUILDUP");
    expect(classifyBuildup(12, 10, 100, 120)).toBe("SHORT_BUILDUP");
    expect(classifyBuildup(10, 12, 120, 100)).toBe("SHORT_COVERING");
    expect(classifyBuildup(12, 10, 120, 100)).toBe("LONG_UNWINDING");
  });
  it("returns UNKNOWN when prev snapshot missing", () => {
    expect(classifyBuildup(null, 10, null, 100)).toBe("UNKNOWN");
  });
});

describe("Writing / Unwinding rankings", () => {
  const legs = [
    leg(24000, "CE", 100, 500),
    leg(24100, "CE", 200, 1000),
    leg(24200, "CE", 150, -300),
    leg(24000, "PE", 100, 800),
    leg(24100, "PE", 250, -600),
  ];
  it("ranks writing by change OI", () => {
    const r = rankWriting(legs, 24050, "CE", 2);
    expect(r[0].strike).toBe(24100);
    expect(r[0].changeOi).toBe(1000);
  });
  it("ranks unwinding by most-negative change OI", () => {
    const r = rankUnwinding(legs, 24050, "PE", 2);
    expect(r[0].strike).toBe(24100);
    expect(r[0].changeOi).toBe(-600);
  });
});

describe("Options S/R selection", () => {
  it("picks highest OI as primary and highest OI addition as secondary", () => {
    const legs = [
      leg(24000, "CE", 500, 100),
      leg(24100, "CE", 200, 900),
      leg(24000, "PE", 900, 200),
      leg(24100, "PE", 100, 500),
    ];
    const levels = selectOptionsLevels(legs);
    const res = levels.find((l) => l.kind === "RESISTANCE" && l.rank === "PRIMARY");
    const resSec = levels.find((l) => l.kind === "RESISTANCE" && l.rank === "SECONDARY");
    const sup = levels.find((l) => l.kind === "SUPPORT" && l.rank === "PRIMARY");
    expect(res?.strike).toBe(24000);
    expect(resSec?.strike).toBe(24100);
    expect(sup?.strike).toBe(24000);
  });
});

describe("Astro confluence", () => {
  it("finds nearest astro level and grades strength", () => {
    const r = nearestAstroLevel(
      24050,
      [
        { planet: "Moon", label: "Moon R1", value: 24020 },
        { planet: "Sun", label: "Sun S1", value: 24052 },
      ],
      5,
    );
    expect(r?.level.planet).toBe("Sun");
    expect(r?.strength).toBe("VERY_STRONG");
  });
  it("respects tolerance scaling for BANK NIFTY", () => {
    expect(confluenceTolerance("BANKNIFTY")).toBeGreaterThan(confluenceTolerance("NIFTY"));
  });
  it("bands scale with tolerance", () => {
    expect(confluenceBand(3, 5)).toBe("VERY_STRONG");
    expect(confluenceBand(9, 5)).toBe("STRONG");
    expect(confluenceBand(18, 5)).toBe("MODERATE");
    expect(confluenceBand(50, 5)).toBe("WEAK");
  });
});

describe("Recommendation scoring", () => {
  const base = {
    spot: 24100,
    atm: 24100,
    maxPain: 24000,
    pcrOi: 1.25,
    pcrVolume: 1.1,
    pcrTrend: 0.1,
    callWriting: 100,
    putWriting: 500,
    vix: 14,
    breadthBias: "Bullish" as const,
    astroBias: "Bullish" as const,
    supportConfluence: "STRONG" as const,
    resistanceConfluence: "WEAK" as const,
    dataComplete: true,
  };
  it("recommends BUY_CE for aligned bullish signals", () => {
    const r = scoreRecommendation(base);
    expect(r.action).toBe("BUY_CE");
    expect(r.confidence).toBeGreaterThan(0);
  });
  it("recommends BUY_PE for aligned bearish signals", () => {
    const r = scoreRecommendation({
      ...base,
      pcrOi: 0.6,
      pcrTrend: -0.2,
      callWriting: 500,
      putWriting: 100,
      breadthBias: "Bearish",
      astroBias: "Bearish",
      supportConfluence: "WEAK",
      resistanceConfluence: "STRONG",
      spot: 23900,
    });
    expect(r.action).toBe("BUY_PE");
  });
  it("recommends WAIT when data incomplete", () => {
    const r = scoreRecommendation({ ...base, dataComplete: false });
    expect(r.action).toBe("WAIT");
    expect(r.confidence).toBe(0);
  });
  it("recommends WAIT when signals balanced", () => {
    const r = scoreRecommendation({
      ...base,
      pcrOi: 1.0,
      pcrTrend: 0,
      callWriting: 200,
      putWriting: 200,
      breadthBias: "Neutral",
      astroBias: "Neutral",
      supportConfluence: "WEAK",
      resistanceConfluence: "WEAK",
      spot: 24000,
      maxPain: 24000,
    });
    expect(r.action).toBe("WAIT");
  });
});

describe("Focus alert confirmation", () => {
  it("requires two consecutive dominant snapshots", () => {
    expect(
      confirmFocus([
        { ts: 1, putWriting: 100, callWriting: 100 },
        { ts: 2, putWriting: 500, callWriting: 100 },
      ]),
    ).toBe(null); // only latest is dominant
    expect(
      confirmFocus([
        { ts: 1, putWriting: 500, callWriting: 100 },
        { ts: 2, putWriting: 500, callWriting: 100 },
      ]),
    ).toBe("FOCUS_CALL");
  });
  it("returns null when fewer than 2 samples", () => {
    expect(confirmFocus([{ ts: 1, putWriting: 500, callWriting: 100 }])).toBe(null);
  });
});

describe("Expiry categorization", () => {
  it("marks near, next, and monthly", () => {
    const now = new Date("2026-07-14T00:00:00.000Z");
    const r = categorizeExpiries(
      ["2026-07-17", "2026-07-24", "2026-07-31", "2026-08-07"],
      now,
    );
    expect(r[0].category).toBe("NEAR_WEEKLY");
    // Monthly (last July expiry) supersedes NEXT_WEEKLY labeling on that slot.
    expect(r.find((x) => x.expiry === "2026-07-31")?.category).toBe("MONTHLY");
    expect(r.find((x) => x.expiry === "2026-07-24")?.category).toBe("NEXT_WEEKLY");
    expect(r[0].daysToExpiry).toBeGreaterThan(0);
  });
});

describe("Data quality", () => {
  it("flags missing OI", () => {
    const snap: OptionChainSnapshot = {
      symbol: "NIFTY",
      spot: 24000,
      expiry: "2026-07-17",
      fetchedAt: new Date().toISOString(),
      strikes: [24000],
      legs: [
        {
          strike: 24000,
          side: "CE",
          oi: NaN as unknown as number,
          changeOi: 0,
          volume: 0,
          ltp: 0,
          changePct: 0,
          iv: null,
          bid: null,
          ask: null,
        },
      ],
      provider: "test",
      source: "SIMULATED",
    };
    const q = assessDataQuality(snap);
    expect(q.ok).toBe(false);
  });
});