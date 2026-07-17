import { describe, it, expect } from "vitest";
import { evaluateDeployment } from "./index";

const base = {
  activeColour: "blue" as const,
  candidateColour: "green" as const,
  candidateHealth: "healthy" as const,
  candidateErrorRate: 0.001,
  candidateLatencyP95Ms: 400,
  manualApproval: true,
  targetEnvironment: "production" as const,
};

describe("deployment-safety", () => {
  it("PROMOTE when all gates pass and manual approved", () => {
    expect(evaluateDeployment(base).decision).toBe("PROMOTE");
  });

  it("HOLD without manual approval in production", () => {
    expect(evaluateDeployment({ ...base, manualApproval: false }).decision).toBe("HOLD");
  });

  it("ROLLBACK when candidate is unhealthy", () => {
    const r = evaluateDeployment({ ...base, candidateHealth: "unhealthy" });
    expect(r.decision).toBe("ROLLBACK");
    expect(r.automaticRollback).toBe(true);
  });

  it("ROLLBACK when error rate exceeds threshold", () => {
    const r = evaluateDeployment({ ...base, candidateErrorRate: 0.5 });
    expect(r.decision).toBe("ROLLBACK");
  });

  it("HOLD when p95 latency high but not fatal", () => {
    const r = evaluateDeployment({ ...base, candidateLatencyP95Ms: 5000 });
    expect(r.decision).toBe("HOLD");
  });

  it("HOLD when candidate colour equals active", () => {
    const r = evaluateDeployment({ ...base, candidateColour: "blue" });
    expect(r.decision).toBe("HOLD");
  });
});