// Phase 3A — Deterministic strategy engine tests. No broker imports.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { classifyVixRegime, recommendStrikeRegime } from "./strike-regime";
import { mergeDirection } from "./direction";
import { runStrategyEngine, STRATEGY_CATALOGUE } from "./strategies";
import { withExplanation, composeExplanation } from "./explanation";
import type { CanonicalSignals } from "./types";

const NOW = "2026-07-14T05:00:00Z";

function run(signals: CanonicalSignals, vix: number | null) {
  return withExplanation(signals, runStrategyEngine({ signals, vix, generatedAt: NOW }));
}

describe("VIX regime & strike rule", () => {
  it("classifies VIX < 15 → LOW → ITM", () => {
    expect(classifyVixRegime(12)).toBe("LOW");
    expect(recommendStrikeRegime(12)).toBe("ITM");
  });
  it("classifies VIX 15–20 → MID → ATM", () => {
    expect(classifyVixRegime(17)).toBe("MID");
    expect(recommendStrikeRegime(17)).toBe("ATM");
  });
  it("classifies VIX > 20 → HIGH → OTM", () => {
    expect(classifyVixRegime(25)).toBe("HIGH");
    expect(recommendStrikeRegime(25)).toBe("OTM");
  });
  it("returns UNKNOWN when VIX unavailable", () => {
    expect(classifyVixRegime(null)).toBe("UNKNOWN");
    expect(recommendStrikeRegime(null)).toBe("UNKNOWN");
  });
});

describe("Direction merger", () => {
  it("resolves bullish consensus", () => {
    const d = mergeDirection({ decision: "BULLISH", pcr: "BULLISH", gti: "BULLISH", breadth: "NEUTRAL" });
    expect(d.bias).toBe("BULLISH");
    expect(d.confidence).toBeGreaterThan(0);
  });
  it("resolves bearish consensus", () => {
    const d = mergeDirection({ decision: "BEARISH", pcr: "BEARISH", gti: "BEARISH" });
    expect(d.bias).toBe("BEARISH");
  });
  it("flags CONFLICT when bulls and bears tie", () => {
    const d = mergeDirection({ decision: "BULLISH", pcr: "BEARISH", gti: "CONFLICT" });
    expect(d.bias).toBe("CONFLICT");
  });
  it("flags UNAVAILABLE when nothing is present", () => {
    const d = mergeDirection({});
    expect(d.bias).toBe("UNAVAILABLE");
  });
  it("caps confidence by decisionConfidence", () => {
    const d = mergeDirection({
      decision: "BULLISH", pcr: "BULLISH", gti: "BULLISH", breadth: "BULLISH", astro: "BULLISH",
      decisionConfidence: 20,
    });
    expect(d.confidence).toBeLessThanOrEqual(20);
  });
});

describe("Strategy engine — direction cases", () => {
  it("recommends bull-directional strategies on BULLISH + LOW-VIX", () => {
    const out = run({ decision: "BULLISH", pcr: "BULLISH", gti: "BULLISH", breadth: "BULLISH" }, 12);
    expect(out.direction.bias).toBe("BULLISH");
    expect(out.strikeRegime).toBe("ITM");
    expect(out.recommended.length).toBeGreaterThan(0);
    const bull = out.recommended.find((s) => s.profile.bias === "BULL");
    expect(bull).toBeDefined();
  });
  it("recommends bear-directional strategies on BEARISH + MID-VIX", () => {
    const out = run({ decision: "BEARISH", pcr: "BEARISH", gti: "BEARISH", breadth: "BEARISH" }, 17);
    expect(out.direction.bias).toBe("BEARISH");
    expect(out.strikeRegime).toBe("ATM");
    expect(out.recommended.some((s) => s.profile.bias === "BEAR")).toBe(true);
  });
  it("prefers neutral/short-vol strategies on NEUTRAL + HIGH-VIX", () => {
    const out = run({ decision: "NEUTRAL", pcr: "NEUTRAL", gti: "NEUTRAL", breadth: "NEUTRAL" }, 25);
    expect(out.strikeRegime).toBe("OTM");
    // Top strategy in neutral regime should be range/short-vol biased
    if (out.recommended.length > 0) {
      expect(["NEUTRAL", "VOL_SHORT"]).toContain(out.recommended[0].profile.bias);
    }
  });
  it("suppresses recommendations on CONFLICT", () => {
    const out = run({ decision: "BULLISH", pcr: "BEARISH", gti: "BULLISH", breadth: "BEARISH" }, 17);
    expect(out.direction.bias).toBe("CONFLICT");
    expect(out.recommended).toEqual([]);
  });
  it("suppresses recommendations on UNAVAILABLE", () => {
    const out = run({}, null);
    expect(out.direction.bias).toBe("UNAVAILABLE");
    expect(out.recommended).toEqual([]);
    expect(out.strikeRegime).toBe("UNKNOWN");
  });
});

describe("Strategy catalogue coverage", () => {
  it("includes every required strategy key", () => {
    const keys = STRATEGY_CATALOGUE.map((s) => s.key);
    for (const k of [
      "BUY_CE","BUY_PE","SELL_CE","SELL_PE",
      "BULL_CALL_SPREAD","BEAR_PUT_SPREAD","BULL_PUT_SPREAD","BEAR_CALL_SPREAD",
      "LONG_STRADDLE","SHORT_STRADDLE","LONG_STRANGLE","SHORT_STRANGLE",
      "IRON_CONDOR","IRON_FLY","CALENDAR_SPREAD","DIAGONAL_SPREAD",
      "RATIO_SPREAD","BUTTERFLY","BROKEN_WING_BUTTERFLY","JADE_LIZARD",
    ]) {
      expect(keys).toContain(k);
    }
  });
  it("single-leg, spread, condor and calendar all appear", () => {
    const single = STRATEGY_CATALOGUE.filter((s) => s.legs === 1).length;
    const spread = STRATEGY_CATALOGUE.filter((s) => s.legs === 2).length;
    const condor = STRATEGY_CATALOGUE.find((s) => s.key === "IRON_CONDOR");
    const cal = STRATEGY_CATALOGUE.find((s) => s.key === "CALENDAR_SPREAD");
    expect(single).toBeGreaterThanOrEqual(4);
    expect(spread).toBeGreaterThanOrEqual(4);
    expect(condor).toBeDefined();
    expect(cal).toBeDefined();
  });
});

describe("Explanation & determinism", () => {
  it("explanation lists every canonical module and VIX", () => {
    const out = run({ decision: "BULLISH", pcr: "BULLISH", gti: "BULLISH", breadth: "NEUTRAL", astro: "BULLISH", gann: "NEUTRAL", gannGap: "NEUTRAL" }, 13.4);
    expect(out.explanation).toMatch(/Decision Bullish/);
    expect(out.explanation).toMatch(/PCR Bullish/);
    expect(out.explanation).toMatch(/GTI Bullish/);
    expect(out.explanation).toMatch(/Breadth Neutral/);
    expect(out.explanation).toMatch(/VIX 13\.40 \(LOW\)/);
    expect(out.explanation).toMatch(/preferred/i);
  });
  it("is deterministic for identical inputs", () => {
    const s: CanonicalSignals = { decision: "BULLISH", pcr: "BULLISH" };
    const a = runStrategyEngine({ signals: s, vix: 14, generatedAt: NOW });
    const b = runStrategyEngine({ signals: s, vix: 14, generatedAt: NOW });
    expect(a).toEqual(b);
  });
  it("standalone composeExplanation composes without recommendation", () => {
    const out = run({}, null);
    expect(composeExplanation({}, out)).toMatch(/No strategy is preferred/);
  });
});

describe("No broker imports", () => {
  it("terminal module never imports broker code", () => {
    const dir = new URL(".", import.meta.url).pathname;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".ts") || f.endsWith(".test.ts")) continue;
      const src = readFileSync(join(dir, f), "utf-8");
      expect(src).not.toMatch(/["'](?:@\/lib\/broker|@\/broker|broker\/)/);
    }
  });
});