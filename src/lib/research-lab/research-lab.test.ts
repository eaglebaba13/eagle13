import { describe, it, expect } from "vitest";
import {
  RESEARCH_LAB_DISCLAIMER,
  RESEARCH_LAB_VERSION,
} from "./types";
import { buildDataset } from "./dataset";
import { buildResearchRunReport, exportJson, compareRuns } from "./report";

describe("Phase 3E · Research Lab wiring", () => {
  it("exposes stable version + disclaimer", () => {
    expect(RESEARCH_LAB_VERSION).toBe("research-lab@1.0.0");
    expect(RESEARCH_LAB_DISCLAIMER).toMatch(/RESEARCH ONLY/);
  });

  it("builds a deterministic empty run (no dataset rows)", () => {
    const ds = buildDataset({
      datasetId: "TEST_DS",
      symbol: "NIFTY",
      timezone: "Asia/Kolkata",
      rows: [],
      generatedAt: "2025-01-01T00:00:00Z",
    });
    const a = buildResearchRunReport({
      runId: "R_A",
      dataset: ds,
      nowIso: "2025-01-01T00:00:00Z",
    });
    const b = buildResearchRunReport({
      runId: "R_B",
      dataset: ds,
      nowIso: "2025-01-01T00:00:00Z",
    });
    expect(a.manifest.datasetHash).toBe(b.manifest.datasetHash);
    // JSON export must not contain credentials/PII (allowlist boundary).
    const json = exportJson(a);
    expect(json).not.toMatch(/authorization|apikey|bearer/i);
  });

  it("compareRuns returns a comparison object for two runs", () => {
    const ds = buildDataset({
      datasetId: "TEST_DS",
      symbol: "NIFTY",
      timezone: "Asia/Kolkata",
      rows: [],
      generatedAt: "2025-01-01T00:00:00Z",
    });
    const a = buildResearchRunReport({ runId: "R_A", dataset: ds, nowIso: "2025-01-01T00:00:00Z" });
    const b = buildResearchRunReport({ runId: "R_B", dataset: ds, nowIso: "2025-01-02T00:00:00Z" });
    const cmp = compareRuns(a, b);
    expect(cmp).toBeTruthy();
  });
});