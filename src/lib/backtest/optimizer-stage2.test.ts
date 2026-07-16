import { describe, it, expect } from "vitest";
import {
  inspectResearchContext,
  researchContextSignature,
  type ResolvedResearchContext,
} from "./research-context";
import { runOptimizerPipeline } from "./optimizer-pipeline";
import {
  emptyOptimizerHistory,
  recordOptimizerHistory,
  findOptimizerHistoryEntry,
  compareOptimizerHistoryEntries,
} from "./optimizer-history";
import {
  emptyPresetLibrary,
  savePreset,
  renamePreset,
  duplicatePreset,
  deletePreset,
  serializePreset,
} from "./optimizer-presets";
import { computeParameterDrift } from "./optimizer-drift";
import { buildHeatmapOverlay, HEATMAP_COLORS } from "./optimizer-heatmap";
import { buildBeforeAfterReport } from "./optimizer-comparison";
import {
  buildOptimizerHistoryCsv,
  buildOptimizerComparisonCsv,
  buildOptimizerBeforeAfterCsv,
  buildOptimizerBundleJson,
  buildPresetLibraryJson,
} from "./optimizer-stage2-exports";
import type {
  ParameterSpec,
  SensitivityCell,
  SensitivityMetrics,
  SensitivityClassification,
} from "./parameter-sensitivity";
import type { OptimizerAggregateInputs } from "./explainable-optimizer";
import type { RobustnessStatus } from "./robustness";
import type { ReliabilityRating } from "./recommendation-validator";

function m(over: Partial<SensitivityMetrics> = {}): SensitivityMetrics {
  return {
    trades: 60, winRate: 0.55, profitFactor: 1.8, expectancy: 2.5, netPnl: 150,
    maxDrawdown: 40, recoveryFactor: 4, stabilityScore: 0.7, oosScore: 0.7,
    monteCarloMedian: 1100, monteCarloP5: 970,
    ...over,
  };
}
function agg(over: Partial<OptimizerAggregateInputs> = {}): OptimizerAggregateInputs {
  return {
    walkForwardStability: 0.8, oosConsistency: 0.75, walkForwardWindows: 6,
    monteCarloP5FinalEquity: 950, monteCarloMedianFinalEquity: 1100, monteCarloSimulations: 500,
    startingCapital: 1000, robustnessStatus: "ROBUST" as RobustnessStatus, robustnessScore: 0.8,
    sensitivityClassification: "STABLE_PLATEAU" as SensitivityClassification,
    profitFactorConsistency: 0.7, calibrationRating: "GOOD" as ReliabilityRating,
    crossAssetConsistency: 0.7, dataQuality: "GOOD",
    ...over,
  };
}
const space: ParameterSpec[] = [{ name: "minScore", min: 60, max: 75, step: 5 }];
const cells: SensitivityCell[] = [
  { params: { minScore: 60 }, metrics: m({ expectancy: 2.0 }) },
  { params: { minScore: 65 }, metrics: m({ expectancy: 2.6 }) },
  { params: { minScore: 70 }, metrics: m({ expectancy: 2.5 }) },
  { params: { minScore: 75 }, metrics: m({ expectancy: 2.2, maxDrawdown: 25 }) },
];

function ctx(over: Partial<ResolvedResearchContext> = {}): ResolvedResearchContext {
  return {
    strategy: "SMC_V1",
    formulaVersion: "SMC_V1",
    baseRunId: "BASE",
    researchRunIds: { sens: "S1", wf: "W1", mc: "M1", rob: "R1" },
    provider: "P",
    instrument: "NIFTY50",
    from: "2024-01-01",
    to: "2024-06-30",
    dataHash: "H",
    parameterSpace: space,
    sensitivityCells: cells,
    aggregate: agg(),
    currentParameters: { minScore: 60 },
    ...over,
  };
}

describe("Phase 21.9 Stage 2 · research context", () => {
  it("reports gaps for incomplete contexts", () => {
    const r = inspectResearchContext(null);
    expect(r.ready).toBe(false);
    expect(r.gaps.length).toBeGreaterThan(0);
  });
  it("is ready for a full context", () => {
    expect(inspectResearchContext(ctx()).ready).toBe(true);
  });
  it("signature is deterministic and changes with inputs", () => {
    const a = researchContextSignature(ctx());
    const b = researchContextSignature(ctx());
    expect(a).toBe(b);
    const c = researchContextSignature(ctx({ from: "2024-02-01" }));
    expect(a).not.toBe(c);
  });
});

describe("Phase 21.9 Stage 2 · pipeline", () => {
  it("runs the optimizer once and never mutates inputs", () => {
    const input = ctx();
    const snap = JSON.stringify(input);
    const out = runOptimizerPipeline(input, undefined, () => "2026-07-16T00:00:00.000Z");
    expect(out.result.version).toBe("EXPLAINABLE_OPTIMIZER_V1");
    expect(out.completedAt).toBe("2026-07-16T00:00:00.000Z");
    expect(JSON.stringify(input)).toBe(snap);
  });
  it("is deterministic for identical contexts", () => {
    const a = runOptimizerPipeline(ctx(), undefined, () => "t");
    const b = runOptimizerPipeline(ctx(), undefined, () => "t");
    expect(a.result.runId).toBe(b.result.runId);
  });
});

describe("Phase 21.9 Stage 2 · history", () => {
  it("records runs and finds by id", () => {
    const r = runOptimizerPipeline(ctx(), undefined, () => "t");
    let h = emptyOptimizerHistory();
    h = recordOptimizerHistory(h, { context: r.context, result: r.result, recordedAt: "t" });
    expect(h.entries.length).toBe(1);
    expect(findOptimizerHistoryEntry(h, h.entries[0].id)).not.toBeNull();
  });
  it("deduplicates same run+context and honors the limit", () => {
    const r = runOptimizerPipeline(ctx(), undefined, () => "t");
    let h = emptyOptimizerHistory();
    for (let i = 0; i < 30; i++) {
      h = recordOptimizerHistory(h, { context: r.context, result: r.result, recordedAt: `t${i}` }, 5);
    }
    expect(h.entries.length).toBe(1); // same id → dedup
  });
  it("compares two entries", () => {
    const a = runOptimizerPipeline(ctx(), undefined, () => "ta").result;
    const b = runOptimizerPipeline(ctx({ from: "2024-02-01" }), undefined, () => "tb").result;
    let h = emptyOptimizerHistory();
    h = recordOptimizerHistory(h, { context: ctx(), result: a, recordedAt: "1" });
    h = recordOptimizerHistory(h, { context: ctx({ from: "2024-02-01" }), result: b, recordedAt: "2" });
    const cmp = compareOptimizerHistoryEntries(h.entries[1], h.entries[0]);
    expect(typeof cmp.scoreDelta).toBe("number");
    expect(typeof cmp.summary).toBe("string");
  });
});

describe("Phase 21.9 Stage 2 · presets", () => {
  it("save / rename / duplicate / delete preserve immutability", () => {
    let lib = emptyPresetLibrary();
    lib = savePreset(lib, { id: "p1", name: "Balanced 60", strategy: "SMC_V1", parameters: { minScore: 60 }, runId: "R", createdAt: "t" });
    expect(lib.presets[0].readOnly).toBe(true);
    expect(lib.presets[0].disclaimer).toContain("RESEARCH PRESET ONLY");
    lib = renamePreset(lib, "p1", "Balanced 60 v2", "t2");
    expect(lib.presets[0].name).toBe("Balanced 60 v2");
    lib = duplicatePreset(lib, "p1", "p2", "t3");
    expect(lib.presets.length).toBe(2);
    expect(lib.presets[0].name).toContain("(copy)");
    lib = deletePreset(lib, "p1");
    expect(lib.presets.length).toBe(1);
  });
  it("rejects duplicate names", () => {
    let lib = emptyPresetLibrary();
    lib = savePreset(lib, { id: "a", name: "X", strategy: "SMC_V1", parameters: { minScore: 60 }, runId: "R", createdAt: "t" });
    expect(() => savePreset(lib, { id: "b", name: "X", strategy: "SMC_V1", parameters: { minScore: 65 }, runId: "R", createdAt: "t" })).toThrow(/PRESET_NAME_TAKEN/);
  });
  it("serializes deterministically", () => {
    let lib = emptyPresetLibrary();
    lib = savePreset(lib, { id: "p1", name: "N", strategy: "SMC_V1", parameters: { minScore: 65 }, runId: "R", createdAt: "t" });
    expect(serializePreset(lib.presets[0])).toBe(serializePreset(lib.presets[0]));
  });
});

describe("Phase 21.9 Stage 2 · drift", () => {
  it("STABLE when current sits inside the safe range and step delta < 0.5", () => {
    const rep = computeParameterDrift(
      { minScore: 65 },
      { minScore: 65 },
      space,
      { minScore: { min: 60, max: 70 } },
    );
    expect(rep.overall).toBe("STABLE");
  });
  it("SMALL_DRIFT for ≤ 1 step deviation inside the range", () => {
    const rep = computeParameterDrift(
      { minScore: 60 },
      { minScore: 65 },
      space,
      { minScore: { min: 60, max: 70 } },
    );
    expect(rep.overall).toBe("SMALL_DRIFT");
  });
  it("UNSAFE_DRIFT when current falls outside the safe range", () => {
    const rep = computeParameterDrift(
      { minScore: 90 },
      { minScore: 65 },
      space,
      { minScore: { min: 60, max: 70 } },
    );
    expect(rep.overall).toBe("UNSAFE_DRIFT");
  });
});

describe("Phase 21.9 Stage 2 · heatmap overlay", () => {
  it("classifies cells with recommended/rejected/unavailable", () => {
    const r = runOptimizerPipeline(ctx(), undefined, () => "t").result;
    const cellsWithGap: SensitivityCell[] = [
      ...cells,
      { params: { minScore: 80 }, metrics: null, reason: "NO_METRICS" },
    ];
    const overlay = buildHeatmapOverlay(cellsWithGap, r);
    expect(overlay.length).toBe(cellsWithGap.length);
    expect(overlay.some((c) => c.classification === "UNAVAILABLE")).toBe(true);
    expect(overlay.every((c) => Object.values(HEATMAP_COLORS).includes(c.color))).toBe(true);
  });
});

describe("Phase 21.9 Stage 2 · comparison", () => {
  it("produces per-metric deltas without recomputing anything", () => {
    const opt = runOptimizerPipeline(ctx(), undefined, () => "t").result;
    const rep = buildBeforeAfterReport({
      currentParameters: { minScore: 60 },
      cells,
      optimizer: opt,
      aggregate: agg(),
    });
    expect(rep.current.metrics).not.toBeNull();
    expect(rep.recommended.metrics).not.toBeNull();
    expect(rep.deltas.length).toBeGreaterThan(0);
    for (const d of rep.deltas) {
      expect(d.recommended - d.current).toBeCloseTo(d.delta, 8);
    }
  });
  it("marks missing current-cell when the current parameters are outside the grid", () => {
    const opt = runOptimizerPipeline(ctx(), undefined, () => "t").result;
    const rep = buildBeforeAfterReport({
      currentParameters: { minScore: 999 },
      cells,
      optimizer: opt,
      aggregate: agg(),
    });
    expect(rep.current.metrics).toBeNull();
    expect(rep.current.missing.length).toBeGreaterThan(0);
    expect(rep.deltas.length).toBe(0);
  });
});

describe("Phase 21.9 Stage 2 · exports", () => {
  it("history + bundle + preset JSON are deterministic and embed the disclaimer", () => {
    const r = runOptimizerPipeline(ctx(), undefined, () => "t").result;
    let h = emptyOptimizerHistory();
    h = recordOptimizerHistory(h, { context: ctx(), result: r, recordedAt: "t" });
    const csv1 = buildOptimizerHistoryCsv(h);
    const csv2 = buildOptimizerHistoryCsv(h);
    expect(csv1).toBe(csv2);
    expect(csv1).toContain("RESEARCH OPTIMIZATION ONLY");

    const lib = savePreset(emptyPresetLibrary(), { id: "p1", name: "N", strategy: "SMC_V1", parameters: { minScore: 65 }, runId: "R", createdAt: "t" });
    const json = buildPresetLibraryJson(lib);
    expect(json).toContain("RESEARCH OPTIMIZATION ONLY");

    const before = buildBeforeAfterReport({
      currentParameters: { minScore: 60 }, cells, optimizer: r, aggregate: agg(),
    });
    const csv = buildOptimizerBeforeAfterCsv(before);
    expect(csv).toContain("profitFactor");

    const bundle = buildOptimizerBundleJson({
      result: r, history: h, presets: lib, comparison: before, drift: null, generatedAt: "t",
    });
    expect(bundle).toBe(buildOptimizerBundleJson({
      result: r, history: h, presets: lib, comparison: before, drift: null, generatedAt: "t",
    }));
  });
  it("comparison CSV embeds run IDs for both sides", () => {
    const a = runOptimizerPipeline(ctx(), undefined, () => "t1").result;
    const b = runOptimizerPipeline(ctx({ from: "2024-02-01" }), undefined, () => "t2").result;
    let h = emptyOptimizerHistory();
    h = recordOptimizerHistory(h, { context: ctx(), result: a, recordedAt: "1" });
    h = recordOptimizerHistory(h, { context: ctx({ from: "2024-02-01" }), result: b, recordedAt: "2" });
    const cmp = compareOptimizerHistoryEntries(h.entries[1], h.entries[0]);
    const csv = buildOptimizerComparisonCsv({ a: h.entries[1], b: h.entries[0], comparison: cmp });
    expect(csv).toContain(a.runId);
    expect(csv).toContain(b.runId);
  });
});