import { describe, it, expect } from "vitest";
import { aggregateMacro, classifyMacroRisk } from "./macro";

describe("macro", () => {
  it("returns LOW for calm inputs", () => {
    const { risk } = classifyMacroRisk([
      { key: "DXY", last: 103, changePct: 0.1 },
      { key: "US10Y", last: 4.2, changePct: 0.2 },
      { key: "CRUDE", last: 78, changePct: 0.3 },
    ]);
    expect(risk).toBe("LOW");
  });
  it("returns HIGH when DXY surges and crude spikes", () => {
    const { risk, reasons } = classifyMacroRisk([
      { key: "DXY", last: 106, changePct: 1.2 },
      { key: "CRUDE", last: 92, changePct: 3.5 },
      { key: "US10Y", last: 4.9, changePct: 2 },
    ]);
    expect(risk).toBe("HIGH");
    expect(reasons.length).toBeGreaterThan(0);
  });
  it("aggregates rows with labels", () => {
    const s = aggregateMacro([{ key: "DXY", last: 100, changePct: 0 }]);
    expect(s.rows[0].label).toBe("US Dollar Index");
  });
});