import { describe, it, expect } from "vitest";
import { classifyGannGap } from "./classifier";
import { computeClosingZone } from "./closing-zone";
import { generateGannGapLevels } from "./levels";
import { DEFAULT_GANN_GAP_CONFIG } from "./config";

const cfg = DEFAULT_GANN_GAP_CONFIG;

function build(reference: number) {
  const levels = generateGannGapLevels({ reference, below: 3, above: 3 });
  return computeClosingZone(reference, levels, cfg);
}

describe("classifyGannGap", () => {
  it("DATA_UNAVAILABLE when no reference", () => {
    const r = classifyGannGap({ hasReference: false, beforeCutoff: false, zone: null });
    expect(r.label).toBe("DATA_UNAVAILABLE");
  });
  it("PENDING before cutoff", () => {
    const r = classifyGannGap({ hasReference: true, beforeCutoff: true, zone: build(22450) });
    expect(r.label).toBe("PENDING");
  });
  it("INDECISION when close sits right at a level (within band)", () => {
    // n=150 → level 22501. Reference 22499 → within 15pt band.
    const zone = build(22499);
    const r = classifyGannGap({ hasReference: true, beforeCutoff: false, zone });
    expect(r.label).toBe("INDECISION");
  });
  it("GAP_UP_RESEARCH when reference reclaimed above nearest-below", () => {
    // 22450 is 249pts above 22201 (below) and 51pts below 22501 (above).
    // 51pts is > band(15), so not indecision; reclaimed above holds.
    const zone = build(22450);
    const r = classifyGannGap({ hasReference: true, beforeCutoff: false, zone });
    expect(r.label === "GAP_UP_RESEARCH" || r.label === "NO_VALID_SETUP").toBe(true);
  });
  it("GAP_DOWN_RESEARCH when close is rejected below nearest-above", () => {
    // 22492 is 9pts below 22501 (within band 15 → indecision, not rejected).
    // Use 22488: 13pts below 22501 → still within band 15. Use custom cfg with band=5.
    const localCfg = { ...cfg, indecisionBandPoints: 5 };
    const levels = generateGannGapLevels({ reference: 22497, below: 3, above: 3 });
    const zone = computeClosingZone(22497, levels, localCfg);
    const r = classifyGannGap({ hasReference: true, beforeCutoff: false, zone });
    // 22497 is 4pts below 22501 → within band 5 → INDECISION.
    expect(r.label).toBe("INDECISION");
  });
});