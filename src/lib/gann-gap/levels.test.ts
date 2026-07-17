import { describe, it, expect } from "vitest";
import {
  gannSquareLevel,
  nearestGannN,
  generateGannGapLevels,
} from "./levels";

describe("gannSquareLevel — spec §2 parity rule", () => {
  it("n=149 → 22201 (odd square, unchanged)", () => {
    expect(gannSquareLevel(149).level).toBe(22201);
  });
  it("n=150 → 22501 (even square, +1)", () => {
    expect(gannSquareLevel(150).squareBase).toBe(22500);
    expect(gannSquareLevel(150).level).toBe(22501);
  });
  it("n=151 → 22801 (odd square)", () => {
    expect(gannSquareLevel(151).level).toBe(22801);
  });
  it("n=152 → 23105 (even square, +1)", () => {
    expect(gannSquareLevel(152).squareBase).toBe(23104);
    expect(gannSquareLevel(152).level).toBe(23105);
  });
  it("rejects non-positive integers", () => {
    expect(() => gannSquareLevel(0)).toThrow();
    expect(() => gannSquareLevel(-1)).toThrow();
    expect(() => gannSquareLevel(1.5)).toThrow();
  });
});

describe("nearestGannN", () => {
  it("finds smallest n whose level >= reference", () => {
    expect(nearestGannN(22200)).toBe(149);
    expect(nearestGannN(22201)).toBe(149);
    expect(nearestGannN(22202)).toBe(150);
    expect(nearestGannN(22501)).toBe(150);
    expect(nearestGannN(22502)).toBe(151);
  });
});

describe("generateGannGapLevels", () => {
  it("produces N below + N above + anchor, ascending by n", () => {
    const out = generateGannGapLevels({ reference: 22450, below: 3, above: 3 });
    expect(out.length).toBe(7);
    for (let i = 1; i < out.length; i++) {
      expect(out[i].n).toBe(out[i - 1].n + 1);
    }
  });
  it("distance is signed relative to reference", () => {
    const out = generateGannGapLevels({ reference: 22450, below: 1, above: 1 });
    for (const l of out) expect(l.distance).toBe(l.level - 22450);
  });
  it("returns [] for non-finite reference", () => {
    expect(generateGannGapLevels({ reference: NaN, below: 1, above: 1 })).toEqual([]);
  });
});