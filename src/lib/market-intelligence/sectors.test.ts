import { describe, it, expect } from "vitest";
import { rankSectors } from "./sectors";

describe("sectors", () => {
  it("ranks strongest and weakest and derives rotation score", () => {
    const r = rankSectors([
      { key: "BANK", changePct: 1.5 },
      { key: "IT", changePct: -0.8 },
      { key: "AUTO", changePct: 0.9 },
      { key: "FMCG", changePct: -1.2 },
      { key: "PHARMA", changePct: 0.3 },
      { key: "METAL", changePct: 2.4 },
    ]);
    expect(r.strongest[0].key).toBe("METAL");
    expect(r.weakest[0].key).toBe("FMCG");
    expect(r.rotationScore).toBeGreaterThan(0);
  });
});