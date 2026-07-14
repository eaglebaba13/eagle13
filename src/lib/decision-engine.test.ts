import { describe, it, expect } from "vitest";
import {
  computeDecision,
  classifyRegime,
  assessRisk,
  mapAction,
  gradeDecision,
  astroSignal,
  optionsSignal,
  pcrSignal,
  breadthSignal,
  vixSignal,
  historicalSignal,
  replaySignal,
  type ModuleSignal,
} from "./decision-engine";

const CTX_OPEN = { vix: 14, historicalAccuracy: 70, marketOpen: true, generatedAt: "2026-07-14T05:00:00Z" };

function s(
  key: ModuleSignal["key"],
  score: number,
  weight: number,
  present = true,
): ModuleSignal {
  return {
    key,
    label: key,
    bias: score > 0.1 ? "BULL" : score < -0.1 ? "BEAR" : "NEUTRAL",
    score,
    confidence: 1,
    weight,
    present,
    note: "",
  };
}

describe("computeDecision — direction & determinism", () => {
  it("returns STRONG_BUY_CE when every core module confirms strongly", () => {
    const d = computeDecision(
      [
        s("astro", 0.9, 0.25),
        s("options", 0.9, 0.2),
        s("pcr", 0.9, 0.1),
        s("breadth", 0.9, 0.15),
        s("sector", 0.6, 0.1),
        s("vix", 0.3, 0.1),
        s("historical", 0.6, 0.1),
        s("replay", 0.6, 0.05),
      ],
      CTX_OPEN,
    );
    expect(d.action).toBe("STRONG_BUY_CE");
    expect(d.confidence).toBeGreaterThanOrEqual(70);
    expect(d.contributions.every((c) => c.present)).toBe(true);
  });

  it("returns STRONG_BUY_PE on symmetric bearish inputs", () => {
    const d = computeDecision(
      [
        s("astro", -0.9, 0.25),
        s("options", -0.9, 0.2),
        s("pcr", -0.9, 0.1),
        s("breadth", -0.9, 0.15),
        s("sector", -0.6, 0.1),
        s("vix", -0.3, 0.1),
        s("historical", -0.6, 0.1),
        s("replay", -0.6, 0.05),
      ],
      CTX_OPEN,
    );
    expect(d.action).toBe("STRONG_BUY_PE");
  });

  it("produces deterministic output for identical inputs", () => {
    const inp = [s("astro", 0.5, 0.5), s("options", 0.5, 0.5)];
    const a = computeDecision(inp, CTX_OPEN);
    const b = computeDecision(inp, CTX_OPEN);
    expect(a).toEqual(b);
  });
});

describe("computeDecision — conflict & missing", () => {
  it("detects conflicts between bullish and bearish present modules", () => {
    const d = computeDecision(
      [s("astro", 0.6, 0.5), s("options", -0.6, 0.5)],
      CTX_OPEN,
    );
    expect(d.conflicts.length).toBeGreaterThan(0);
    expect(d.penalties.some((p) => p.reason.includes("conflict"))).toBe(true);
  });

  it("degrades to WAIT when everything is missing", () => {
    const d = computeDecision(
      [s("astro", 0, 0.5, false), s("options", 0, 0.5, false)],
      CTX_OPEN,
    );
    expect(d.action).toBe("WAIT");
    expect(d.missing.length).toBe(2);
  });

  it("redistributes weight when a module is missing", () => {
    const d = computeDecision(
      [
        s("astro", 1, 0.5),
        s("options", 0, 0.5, false),
      ],
      CTX_OPEN,
    );
    const astro = d.contributions.find((c) => c.key === "astro")!;
    // astro absorbs all effective weight → contribution ≈ total prior.
    expect(astro.effectiveWeight).toBeCloseTo(1, 5);
  });
});

describe("computeDecision — penalties", () => {
  it("reduces confidence when historical accuracy is poor", () => {
    const strong = [
      s("astro", 0.8, 0.25),
      s("options", 0.8, 0.25),
      s("pcr", 0.8, 0.25),
      s("breadth", 0.8, 0.25),
    ];
    const good = computeDecision(strong, { ...CTX_OPEN, historicalAccuracy: 80 });
    const bad = computeDecision(strong, { ...CTX_OPEN, historicalAccuracy: 45 });
    expect(bad.confidence).toBeLessThan(good.confidence);
  });

  it("penalises closed-market decisions", () => {
    const inp = [s("astro", 0.8, 0.5), s("options", 0.8, 0.5)];
    const open = computeDecision(inp, { ...CTX_OPEN, marketOpen: true });
    const closed = computeDecision(inp, { ...CTX_OPEN, marketOpen: false });
    expect(closed.confidence).toBeLessThanOrEqual(open.confidence - 10);
    expect(closed.checklist.find((c) => c.key === "session")!.pass).toBe(false);
  });
});

describe("regime / risk / grade / helpers", () => {
  it("classifies bull/bear/high-vol regimes", () => {
    expect(classifyRegime(0.5, 14, 0)).toBe("BULL_TREND");
    expect(classifyRegime(-0.5, 14, 0)).toBe("BEAR_TREND");
    expect(classifyRegime(0.5, 24, 0)).toBe("HIGH_VOLATILITY");
    expect(classifyRegime(0.05, 14, 0)).toBe("RANGE");
    expect(classifyRegime(0.5, 14, 4)).toBe("TRANSITION");
  });

  it("assessRisk escalates on elevated VIX + conflicts", () => {
    const r = assessRisk({ vix: 26, confidence: 30, conflicts: 3, marketOpen: true, missing: 0 });
    expect(r.level).toBe("VERY_HIGH");
    const r2 = assessRisk({ vix: 12, confidence: 90, conflicts: 0, marketOpen: true, missing: 0 });
    expect(r2.level).toBe("LOW");
  });

  it("mapAction gates STRONG_* on core-agreement and confidence", () => {
    expect(mapAction(0.8, 90, true, true)).toBe("STRONG_BUY_CE");
    expect(mapAction(0.8, 90, false, true)).toBe("BUY_CE");
    expect(mapAction(-0.8, 90, true, true)).toBe("STRONG_BUY_PE");
    expect(mapAction(0.1, 90, true, true)).toBe("WAIT");
  });

  it("gradeDecision returns A+ only on perfect alignment", () => {
    expect(gradeDecision(90, 6, 0, 0)).toBe("A+");
    expect(gradeDecision(90, 6, 1, 0)).toBe("A");
    expect(gradeDecision(60, 3, 0, 0)).toBe("B");
    expect(gradeDecision(30, 1, 0, 0)).toBe("D");
  });
});

describe("adapters mark modules correctly", () => {
  it("astroSignal reflects bull vs bear planet counts", () => {
    const bull = astroSignal({ bullCount: 6, bearCount: 2, retroCount: 0, emaBias: "Bullish" });
    const bear = astroSignal({ bullCount: 1, bearCount: 6, retroCount: 1, emaBias: "Bearish" });
    expect(bull.bias).toBe("BULL");
    expect(bear.bias).toBe("BEAR");
  });
  it("optionsSignal / pcrSignal handle missing data", () => {
    expect(
      optionsSignal({ pcrOi: null, writingBiasBull: false, writingBiasBear: false, present: false }).present,
    ).toBe(false);
    expect(pcrSignal({ pcrOi: null }).present).toBe(false);
    expect(breadthSignal({ advancers: 0, decliners: 0, present: false }).present).toBe(false);
    expect(vixSignal({ vix: null, changePct: null }).present).toBe(false);
    expect(historicalSignal({ winRatePct: null, direction: "BULL", sampleSize: 0 }).present).toBe(false);
    expect(replaySignal({ agreesWithDirection: null, direction: "BULL" }).present).toBe(false);
  });
});

describe("checklist & explanation transparency", () => {
  it("STRONG only when every core checklist item passes", () => {
    const d = computeDecision(
      [
        s("astro", 0.9, 0.25),
        s("options", -0.9, 0.2), // dissenting core
        s("pcr", 0.9, 0.1),
        s("breadth", 0.9, 0.15),
      ],
      CTX_OPEN,
    );
    expect(d.action).not.toBe("STRONG_BUY_CE");
    expect(d.checklist.find((c) => c.key === "options")!.pass).toBe(false);
  });

  it("explanation lists positive and negative contributors", () => {
    const d = computeDecision(
      [s("astro", 0.8, 0.5), s("options", -0.4, 0.5)],
      CTX_OPEN,
    );
    expect(d.explanation).toMatch(/Supporting/i);
    expect(d.explanation).toMatch(/Against/i);
  });
});