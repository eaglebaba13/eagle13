import { describe, it, expect } from "vitest";
import {
  axisValueCount,
  estimateGridCells,
  validateSensitivityGrid,
  RESEARCH_UI_MAX_CELLS,
  SENSITIVITY_UI_MARKER,
  SENSITIVITY_UI_ERROR_LABEL,
} from "./sensitivity-ui";

describe("sensitivity-ui", () => {
  it("exports the UI marker", () => {
    expect(SENSITIVITY_UI_MARKER).toBe("SENSITIVITY_UI_V1");
  });
  it("counts axis values inclusively", () => {
    expect(axisValueCount({ name: "x", min: 0, max: 10, step: 5 })).toBe(3);
    expect(axisValueCount({ name: "x", min: 1, max: 1, step: 1 })).toBe(1);
  });
  it("returns 0 for invalid axes", () => {
    expect(axisValueCount({ name: "x", min: 0, max: 5, step: 0 })).toBe(0);
    expect(axisValueCount({ name: "x", min: 10, max: 0, step: 1 })).toBe(0);
  });
  it("estimates 1D and 2D grid cells", () => {
    expect(estimateGridCells([{ name: "x", min: 0, max: 4, step: 1 }])).toBe(5);
    expect(
      estimateGridCells([
        { name: "x", min: 0, max: 4, step: 1 },
        { name: "y", min: 0, max: 4, step: 1 },
      ]),
    ).toBe(25);
  });
  it("rejects empty spec list", () => {
    const r = validateSensitivityGrid([]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("INVALID_PARAMETER_GRID");
  });
  it("rejects invalid ranges", () => {
    const r = validateSensitivityGrid([{ name: "x", min: 5, max: 1, step: 1 }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("INVALID_PARAMETER_GRID");
  });
  it("rejects axis with too many values", () => {
    const r = validateSensitivityGrid([{ name: "x", min: 0, max: 100, step: 1 }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("GRID_TOO_LARGE");
  });
  it("rejects grids exceeding cell cap", () => {
    const r = validateSensitivityGrid([
      { name: "x", min: 0, max: 9, step: 1 },
      { name: "y", min: 0, max: 9, step: 1 },
      { name: "z", min: 0, max: 4, step: 1 },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("GRID_TOO_LARGE");
  });
  it("accepts a valid grid within caps", () => {
    const r = validateSensitivityGrid([
      { name: "x", min: 0, max: 4, step: 1 },
      { name: "y", min: 0, max: 4, step: 1 },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.cells).toBe(25);
      expect(r.cells).toBeLessThanOrEqual(RESEARCH_UI_MAX_CELLS);
    }
  });
  it("exposes labels for every typed error code", () => {
    for (const label of Object.values(SENSITIVITY_UI_ERROR_LABEL)) {
      expect(label.length).toBeGreaterThan(0);
    }
  });
});