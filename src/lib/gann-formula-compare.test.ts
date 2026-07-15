import { describe, it, expect } from "vitest";
import {
  computeRunId,
  classifyConflict,
  FORMULA_VERSIONS_ALL,
} from "./gann-formula-compare";
import { INTRADAY_FORMULA_VERSIONS } from "./engine-version";

describe("Phase 21.2 Stage 5 · formula-version isolation", () => {
  const base = {
    instrument: "NIFTY50",
    from: "2026-01-01",
    to: "2026-06-30",
    ambiguousPolicy: "conservative",
    costs: { cost: 0, slippage: 0 },
  };

  it("Run IDs differ per formula version", () => {
    const ids = FORMULA_VERSIONS_ALL.map((v) =>
      computeRunId({ ...base, formulaVersion: v }),
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toContain(
      INTRADAY_FORMULA_VERSIONS.GANN_ASTRO_INTRADAY_ABSOLUTE_V1,
    );
  });

  it("Same args = same Run ID (deterministic)", () => {
    const a = computeRunId({
      ...base,
      formulaVersion: INTRADAY_FORMULA_VERSIONS.GANN_ASTRO_INTRADAY_ABSOLUTE_V1,
    });
    const b = computeRunId({
      ...base,
      formulaVersion: INTRADAY_FORMULA_VERSIONS.GANN_ASTRO_INTRADAY_ABSOLUTE_V1,
    });
    expect(a).toBe(b);
  });

  it("conflict classifier maps every meaningful pair", () => {
    expect(classifyConflict("BUY", "BUY")).toBe("BOTH_AGREE");
    expect(classifyConflict("BUY", "SELL")).toBe("PROD_BUY_ABS_SELL");
    expect(classifyConflict("SELL", "BUY")).toBe("PROD_SELL_ABS_BUY");
    expect(classifyConflict("BUY", "WAIT")).toBe("PROD_BUY_ABS_WAIT");
    expect(classifyConflict("WAIT", "BUY")).toBe("PROD_WAIT_ABS_BUY");
    expect(classifyConflict("UNKNOWN", "BUY")).toBe("DATA_INCOMPLETE");
  });
});