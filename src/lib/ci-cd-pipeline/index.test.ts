import { describe, it, expect } from "vitest";
import {
  PRODUCTION_PIPELINE,
  evaluatePipelineRun,
  validatePipeline,
} from "./index";

describe("ci-cd-pipeline", () => {
  it("production pipeline validates cleanly", () => {
    const r = validatePipeline();
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("detects unknown dependency", () => {
    const r = validatePipeline([
      { id: "lint", label: "Lint", dependsOn: ["typescript"], blocking: true, description: "" },
    ] as any);
    expect(r.ok).toBe(false);
  });

  it("detects cycles", () => {
    const r = validatePipeline([
      { id: "lint", label: "l", dependsOn: ["typescript"], blocking: true, description: "" },
      { id: "typescript", label: "t", dependsOn: ["lint"], blocking: true, description: "" },
    ] as any);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("cycle"))).toBe(true);
  });

  it("evaluatePipelineRun fails when a blocking stage skipped", () => {
    const r = evaluatePipelineRun({ lint: true, typescript: true });
    expect(r.verdict).toBe("FAIL");
  });

  it("evaluatePipelineRun passes when all blocking stages ok", () => {
    const outcomes: any = {};
    for (const s of PRODUCTION_PIPELINE) outcomes[s.id] = true;
    expect(evaluatePipelineRun(outcomes).verdict).toBe("PASS");
  });

  it("non-blocking failure does not fail the run", () => {
    const outcomes: any = {};
    for (const s of PRODUCTION_PIPELINE) outcomes[s.id] = true;
    outcomes["bundle-analysis"] = false;
    expect(evaluatePipelineRun(outcomes).verdict).toBe("PASS");
  });
});