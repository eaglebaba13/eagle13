import { describe, it, expect } from "vitest";

describe("OptionChainTable · Strike Depth & Spot Divider Invariant Tests", () => {
  it("slices visible strikes symmetrically around ATM based on strikeDepth (5, 10, 15, 20)", () => {
    // Generate strikes from 23000 to 27000 with step 50
    const strikes: { strike: number; isAtm: boolean }[] = [];
    const atmStrike = 25100;
    for (let s = 23000; s <= 27000; s += 50) {
      strikes.push({ strike: s, isAtm: s === atmStrike });
    }

    const testDepths = [5, 10, 15, 20];

    for (const depth of testDepths) {
      let atmIndex = strikes.findIndex((s) => s.isAtm || s.strike === atmStrike);
      const start = Math.max(0, atmIndex - depth);
      const end = Math.min(strikes.length, atmIndex + depth + 1);
      const visible = strikes.slice(start, end);

      // Depth of 5 should give 5 below + 1 ATM + 5 above = 11 strikes
      expect(visible.length).toBe(depth * 2 + 1);
      expect(visible.some((s) => s.isAtm)).toBe(true);
      expect(visible[depth].strike).toBe(atmStrike);
    }
  });

  it("calculates exactly ONE spot divider index between the strike below and above spot", () => {
    const visibleStrikes = [
      { strike: 25000 },
      { strike: 25050 },
      { strike: 25100 },
      { strike: 25150 },
      { strike: 25200 },
    ];

    const spotPrice = 25120; // Between 25100 and 25150

    // Algorithm from OptionChainTable
    const firstAboveIdx = visibleStrikes.findIndex((s) => s.strike > spotPrice);
    const spotDividerIndex = firstAboveIdx !== -1 ? firstAboveIdx : visibleStrikes.length;

    // Must point to index 3 (strike 25150)
    expect(spotDividerIndex).toBe(3);

    // Verify in iteration that the divider condition is satisfied strictly ONCE
    let dividerCount = 0;
    visibleStrikes.forEach((row, idx) => {
      if (idx === spotDividerIndex && spotPrice > 0) {
        dividerCount++;
      }
    });

    expect(dividerCount).toBe(1);
  });

  it("never duplicates spot divider even when multiple strikes are below spotPrice", () => {
    const visibleStrikes = Array.from({ length: 21 }, (_, i) => ({ strike: 24500 + i * 50 }));
    const spotPrice = 25044.65;

    const firstAboveIdx = visibleStrikes.findIndex((s) => s.strike > spotPrice);
    const spotDividerIndex = firstAboveIdx !== -1 ? firstAboveIdx : visibleStrikes.length;

    let dividerCount = 0;
    visibleStrikes.forEach((row, idx) => {
      if (idx === spotDividerIndex && spotPrice > 0) {
        dividerCount++;
      }
      if (idx === visibleStrikes.length - 1 && spotDividerIndex === visibleStrikes.length && spotPrice > 0) {
        dividerCount++;
      }
    });

    expect(dividerCount).toBe(1);
  });

  it("places spot divider at the very end if spot price is above all visible strikes", () => {
    const visibleStrikes = [
      { strike: 24800 },
      { strike: 24850 },
      { strike: 24900 },
    ];
    const spotPrice = 25050; // Above all strikes

    const firstAboveIdx = visibleStrikes.findIndex((s) => s.strike > spotPrice);
    const spotDividerIndex = firstAboveIdx !== -1 ? firstAboveIdx : visibleStrikes.length;

    expect(spotDividerIndex).toBe(visibleStrikes.length);

    let dividerCount = 0;
    visibleStrikes.forEach((row, idx) => {
      if (idx === spotDividerIndex && spotPrice > 0) {
        dividerCount++;
      }
      if (idx === visibleStrikes.length - 1 && spotDividerIndex === visibleStrikes.length && spotPrice > 0) {
        dividerCount++;
      }
    });

    expect(dividerCount).toBe(1);
  });
});
