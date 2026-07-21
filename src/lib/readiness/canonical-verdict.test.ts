// Phase 41 — Canonical verdict dependency-rule tests.

import { describe, it, expect } from "vitest";
import { deriveCanonicalVerdict } from "./canonical-verdict";
import type { RuntimeReadinessReport } from "@/lib/runtime-readiness/runtime-readiness";

function make(
  overrides: Partial<RuntimeReadinessReport> = {},
): RuntimeReadinessReport {
  return {
    schemaVersion: 1,
    generatedAt: "2026-07-21T00:00:00Z",
    overall: "READY",
    criticalModules: [],
    evidence: [],
    blockers: [],
    warnings: [],
    contradictions: [],
    provenance: { modules: 0, healthy: 0, degraded: 0, blocked: 0, demo: 0 },
    ...overrides,
  };
}

describe("deriveCanonicalVerdict", () => {
  it("READY runtime → subscription and closed beta READY", () => {
    const v = deriveCanonicalVerdict(make({ overall: "READY" }));
    expect(v.runtime).toBe("READY");
    expect(v.subscription).toBe("READY");
    expect(v.closedBeta).toBe("READY");
  });

  it("NOT_READY runtime → subscription BLOCKED (never READY)", () => {
    const v = deriveCanonicalVerdict(make({ overall: "NOT_READY", blockers: ["x"] }));
    expect(v.subscription).toBe("BLOCKED");
    // Closed beta must not be READY when runtime NOT_READY
    expect(v.closedBeta).not.toBe("READY");
  });

  it("PARTIALLY_READY → subscription HOLD, closed beta READY with caveats", () => {
    const v = deriveCanonicalVerdict(make({ overall: "PARTIALLY_READY" }));
    expect(v.subscription).toBe("HOLD");
    expect(v.closedBeta).toBe("READY");
    expect(v.caveats.length).toBeGreaterThan(0);
  });

  it("critical contradiction → both BLOCKED regardless of overall", () => {
    const v = deriveCanonicalVerdict(
      make({
        overall: "PARTIALLY_READY",
        contradictions: [
          { code: "X", severity: "critical", modules: [], message: "m" },
        ],
      }),
    );
    expect(v.subscription).toBe("BLOCKED");
    expect(v.closedBeta).toBe("BLOCKED");
  });

  it("null report → BLOCKED everything", () => {
    const v = deriveCanonicalVerdict(null);
    expect(v.subscription).toBe("BLOCKED");
    expect(v.closedBeta).toBe("BLOCKED");
    expect(v.runtime).toBe("NOT_READY");
  });

  it("never emits contradictory pair: NOT_READY + subscription READY", () => {
    for (const overall of ["NOT_READY", "PARTIALLY_READY", "READY"] as const) {
      const v = deriveCanonicalVerdict(make({ overall }));
      if (v.subscription === "READY") expect(v.runtime).toBe("READY");
      if (v.closedBeta === "READY") expect(v.runtime).not.toBe("NOT_READY");
    }
  });
});