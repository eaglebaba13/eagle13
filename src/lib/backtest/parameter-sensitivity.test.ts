import { describe, it, expect } from "vitest";
import {
  classifySensitivitySurface,
  computeSensitivityRunId,
  generateParameterGrid,
  runParameterSensitivity,
  type ParameterCombination,
  type SensitivityCell,
  type SensitivityMetrics,
} from "./parameter-sensitivity";

function m(overrides: Partial<SensitivityMetrics>): SensitivityMetrics {
  return {
    trades: 30, winRate: 0.5, profitFactor: 1.5, expectancy: 1, netPnl: 30, maxDrawdown: 5,
    recoveryFactor: 6, stabilityScore: 0.5, oosScore: 0.5, monteCarloMedian: 1050, monteCarloP5: 950,
    ...overrides,
  };
}
function cell(params: ParameterCombination, metrics: SensitivityMetrics | null): SensitivityCell {
  return { params, metrics };
}

describe("Phase 21.6 Stage 1 · parameter grid", () => {
  it("generates cross-product for two axes", () => {
    const grid = generateParameterGrid([
      { name: "a", min: 1, max: 3, step: 1 },
      { name: "b", min: 0, max: 0.2, step: 0.1 },
    ]);
    expect(grid.length).toBe(9); // 3 x 3
    expect(grid[0]).toEqual({ a: 1, b: 0 });
  });
  it("rejects invalid grid specs", () => {
    expect(() => generateParameterGrid([{ name: "a", min: 0, max: -1, step: 1 }])).toThrow(/INVALID_GRID/);
    expect(() => generateParameterGrid([{ name: "a", min: 0, max: 1, step: 0 }])).toThrow(/INVALID_GRID/);
  });
});

describe("Phase 21.6 Stage 1 · sensitivity runner", () => {
  it("captures failures per-cell and marks low-sample cells as insufficient", async () => {
    const combos: ParameterCombination[] = [{ a: 1 }, { a: 2 }, { a: 3 }];
    const cells = await runParameterSensitivity(combos, async (p) => {
      if (p.a === 2) throw new Error("boom");
      if (p.a === 3) return m({ trades: 2 });
      return m({});
    });
    expect(cells[0].metrics).not.toBeNull();
    expect(cells[1].metrics).toBeNull();
    expect(cells[1].reason).toBe("boom");
    expect(cells[2].metrics).toBeNull();
    expect(cells[2].reason).toContain("INSUFFICIENT_DATA");
  });
});

describe("Phase 21.6 Stage 1 · surface classification", () => {
  it("classifies uniform values as STABLE_PLATEAU", () => {
    const cells = [1, 2, 3, 4].map((a) => cell({ a }, m({ expectancy: 1 })));
    expect(classifySensitivitySurface(cells).classification).toBe("STABLE_PLATEAU");
  });
  it("classifies strictly increasing expectancy as MONOTONIC", () => {
    const cells = [1, 2, 3, 4, 5].map((a) => cell({ a }, m({ expectancy: a })));
    expect(classifySensitivitySurface(cells).classification).toBe("MONOTONIC");
  });
  it("classifies an isolated peak as NARROW_OPTIMUM", () => {
    const cells = [1, 2, 3, 4, 5, 6, 7].map((a) => cell({ a }, m({ expectancy: a === 4 ? 100 : 1 })));
    expect(classifySensitivitySurface(cells).classification).toBe("NARROW_OPTIMUM");
  });
  it("classifies random high-dispersion surfaces as ERRATIC", () => {
    const vals = [10, -10, 20, -20, 5, -5, 25, -25, 15];
    const cells = vals.map((v, i) => cell({ a: i }, m({ expectancy: v })));
    expect(classifySensitivitySurface(cells).classification).toBe("ERRATIC");
  });
  it("returns INSUFFICIENT_DATA when < 3 valid cells", () => {
    const cells = [1, 2].map((a) => cell({ a }, m({})));
    expect(classifySensitivitySurface(cells).classification).toBe("INSUFFICIENT_DATA");
  });
});

describe("Phase 21.6 Stage 1 · sensitivity Run ID", () => {
  const base = {
    baseRunId: "R", strategy: "SMC", formula: "SMC_V1", grid: [{ name: "minScore", min: 0, max: 1, step: 0.1 }],
    from: "2024-01-01", to: "2024-01-31", dataHash: "hash",
  };
  it("is deterministic and prefixed SENSITIVITY_V1", () => {
    expect(computeSensitivityRunId(base)).toBe(computeSensitivityRunId(base));
    expect(computeSensitivityRunId(base)).toMatch(/^SENSITIVITY_V1:[0-9a-f]{8}$/);
  });
  it("changes when the grid changes", () => {
    const b = { ...base, grid: [{ name: "minScore", min: 0, max: 1, step: 0.2 }] };
    expect(computeSensitivityRunId(base)).not.toBe(computeSensitivityRunId(b));
  });
});
