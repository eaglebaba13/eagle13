import { describe, it, expect } from "vitest";
import {
  NIFTY50_CONSTITUENTS,
  NIFTY50_REGISTRY_VERSION,
  nifty50Symbols,
  nifty50WeightMap,
  topWeightedBasket,
  totalRegisteredWeight,
} from "./nifty50-registry";
import { SECTOR_REGISTRY, SECTOR_REGISTRY_VERSION, findSector } from "./sector-registry";

describe("NIFTY50 registry", () => {
  it("has a versioned effective date and 50 constituents", () => {
    expect(NIFTY50_REGISTRY_VERSION).toMatch(/^nifty50-registry@\d{4}-\d{2}-\d{2}$/);
    expect(NIFTY50_CONSTITUENTS.length).toBe(50);
    expect(new Set(nifty50Symbols()).size).toBe(50);
  });
  it("weights sum close to 1", () => {
    const s = totalRegisteredWeight(NIFTY50_CONSTITUENTS);
    expect(s).toBeGreaterThan(0.9);
    expect(s).toBeLessThan(1.1);
  });
  it("topWeightedBasket returns descending weights", () => {
    const top = topWeightedBasket(10);
    expect(top.length).toBe(10);
    for (let i = 1; i < top.length; i++) {
      expect(top[i - 1].weight).toBeGreaterThanOrEqual(top[i].weight);
    }
  });
  it("weightMap keys match constituent symbols", () => {
    const m = nifty50WeightMap();
    for (const c of NIFTY50_CONSTITUENTS) expect(m.get(c.symbol)).toBe(c.weight);
  });
});

describe("sector registry", () => {
  it("is versioned and covers Banking/IT/Oil&Gas/Auto", () => {
    expect(SECTOR_REGISTRY_VERSION).toMatch(/^sector-registry@/);
    expect(SECTOR_REGISTRY.map((s) => s.id).sort()).toEqual(["AUTO", "BANKING", "IT", "OIL_GAS"]);
  });
  it("each sector weights sum close to 1", () => {
    for (const s of SECTOR_REGISTRY) {
      const t = s.constituents.reduce((a, c) => a + c.weight, 0);
      expect(t).toBeGreaterThan(0.9);
      expect(t).toBeLessThan(1.1);
    }
  });
  it("throws on unknown sector", () => {
    // @ts-expect-error runtime guard
    expect(() => findSector("UNKNOWN")).toThrow();
  });
});
