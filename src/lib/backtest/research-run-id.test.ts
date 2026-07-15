import { describe, it, expect } from "vitest";
import { computeResearchRunId } from "./research-run-id";

const base = {
  strategies: ["ASTRO", "SMC"] as const,
  formula: "SMC_V1" as const,
  splitMode: "70_30" as const,
  trainingPct: 70,
  validationPct: 30,
  provider: "CSV",
  dataHash: "abcdef01",
  from: "2024-01-01",
  to: "2024-01-31",
};

describe("Phase 21.5 Stage 1 · research run id", () => {
  it("same input → same id", () => {
    expect(computeResearchRunId({ ...base })).toBe(computeResearchRunId({ ...base }));
  });

  it("prefix is RESEARCH_V1:<8-hex>", () => {
    expect(computeResearchRunId(base)).toMatch(/^RESEARCH_V1:[0-9a-f]{8}$/);
  });

  it("strategy order does not affect id (sorted)", () => {
    const a = computeResearchRunId(base);
    const b = computeResearchRunId({ ...base, strategies: ["SMC", "ASTRO"] });
    expect(a).toBe(b);
  });

  it("changes when data hash changes", () => {
    const a = computeResearchRunId(base);
    const b = computeResearchRunId({ ...base, dataHash: "deadbeef" });
    expect(a).not.toBe(b);
  });
});