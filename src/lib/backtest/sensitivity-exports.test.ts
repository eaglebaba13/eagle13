import { describe, it, expect } from "vitest";
import {
  buildSensitivityCellsCsv,
  buildSensitivityMatrixCsv,
  buildSensitivityJson,
  buildResearchBundleJson,
  SENSITIVITY_EXPORTS_MARKER,
  type SensitivityExportProvenance,
} from "./sensitivity-exports";
import type { SensitivityCell } from "./parameter-sensitivity";

const prov: SensitivityExportProvenance = {
  researchRunId: "R1",
  baseRunId: "B1",
  sensitivityRunId: "SENSITIVITY_V1:abc",
  strategy: "SMC_V1",
  formulaVersion: "SMC_V1",
  provider: "csv",
  dataHash: "dead",
  requestedRange: { from: "2025-01-01", to: "2025-01-02" },
  actualRange: { from: "2025-01-01", to: "2025-01-02" },
  timeframe: "5m",
  timezone: "Asia/Kolkata",
  costs: { slippagePct: 0 },
  grid: [
    { name: "minScore", min: 40, max: 60, step: 10 },
    { name: "rr", min: 1, max: 2, step: 0.5 },
  ],
  normalizeWeights: true,
  includeMonteCarlo: false,
  counters: { providerLoadCount: 0, dataQualityCount: 0, executionCount: 9 },
  dataQuality: { status: "OK" },
  classification: "STABLE_PLATEAU",
  partial: false,
  generatedAt: "2025-01-01T00:00:00.000Z",
};

const cells: SensitivityCell[] = [
  {
    params: { minScore: 40, rr: 1 },
    metrics: {
      trades: 20,
      winRate: 0.55,
      profitFactor: 1.4,
      expectancy: 12,
      netPnl: 240,
      maxDrawdown: 50,
      recoveryFactor: 4.8,
      stabilityScore: 65,
      oosScore: 70,
      monteCarloMedian: 200,
      monteCarloP5: 100,
    },
  },
  { params: { minScore: 40, rr: 1.5 }, metrics: null, reason: "INSUFFICIENT_DATA: trades=3" },
];

describe("sensitivity-exports", () => {
  it("marker", () => expect(SENSITIVITY_EXPORTS_MARKER).toBe("SENSITIVITY_EXPORTS_V1"));

  it("cells CSV includes provenance and disclaimer", () => {
    const csv = buildSensitivityCellsCsv(cells, prov);
    expect(csv).toContain("RESEARCH ANALYSIS — NOT A LIVE TRADE RECOMMENDATION");
    expect(csv).toContain("sensitivityRunId=SENSITIVITY_V1:abc");
    expect(csv).toContain("minScore,rr,trades");
    expect(csv).toContain("40,1,20,");
    expect(csv).toContain("INSUFFICIENT_DATA");
  });

  it("matrix CSV lays out 2D grid", () => {
    const csv = buildSensitivityMatrixCsv(cells, prov, "expectancy");
    expect(csv).toContain("rr\\minScore");
  });

  it("json export carries surface", () => {
    const json = buildSensitivityJson(cells, null, prov);
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe("SENSITIVITY_V1");
    expect(parsed.cells).toHaveLength(2);
    expect(parsed.provenance.partial).toBe(false);
  });

  it("bundle json includes context + sensitivity", () => {
    const bundle = buildResearchBundleJson({
      context: {
        instrument: "NIFTY50",
        timeframe: "5m",
        provider: "csv",
        timezone: "Asia/Kolkata",
        requestedRange: prov.requestedRange,
        actualRange: prov.actualRange,
        dataHash: "dead",
        dataQuality: { status: "OK", coveragePct: 100, missingBars: 0, reasons: [] },
        baseRunId: "B1",
        costs: { slippagePct: 0, brokerageFlat: 0, brokeragePct: 0, taxesPct: 0 },
      },
      researchRunId: "R1",
      sensitivity: {
        runId: prov.sensitivityRunId,
        cells,
        surface: null,
        grid: prov.grid.slice(),
        partial: false,
        counters: prov.counters,
      },
    });
    const parsed = JSON.parse(bundle);
    expect(parsed.version).toBe("RESEARCH_BUNDLE_V1");
    expect(parsed.sensitivity.cells).toHaveLength(2);
    expect(parsed.context.instrument).toBe("NIFTY50");
  });
});