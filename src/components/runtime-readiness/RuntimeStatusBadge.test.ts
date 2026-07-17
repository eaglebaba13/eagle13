import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RuntimeStatusBadge, sourceLabel } from "./RuntimeStatusBadge";
import { RuntimeModuleCard } from "./RuntimeModuleCard";
import { RuntimeContradictionPanel } from "./RuntimeContradictionPanel";
import { RuntimeReadinessSummary } from "./RuntimeReadinessSummary";
import type { RuntimeEvidence } from "@/lib/runtime-readiness/runtime-evidence";
import type { RuntimeReadinessReport } from "@/lib/runtime-readiness/runtime-readiness";

const ev: RuntimeEvidence = {
  module: "GTI",
  status: "DEMO",
  readiness: "NOT_READY",
  source: "RESEARCH_DEMO",
  capability: "COMPUTED",
  freshness: "FRESH",
  quality: "PARTIAL",
  observedAt: "2026-07-17T09:00:00.000Z",
  latencyMs: 42,
  reason: "GTI inherits breadth source RESEARCH_DEMO",
  blockers: [],
  warnings: ["Breadth is demo"],
  provenance: "BREADTH",
  diagnosticsPath: "/market-breadth",
};

describe("Phase 2G · RuntimeStatusBadge", () => {
  it("renders label and role=status with aria-label", () => {
    const html = renderToStaticMarkup(
      createElement(RuntimeStatusBadge, { label: "READY", tone: "HEALTHY" }),
    );
    expect(html).toContain("READY");
    expect(html).toContain('role="status"');
    expect(html).toContain("aria-label");
  });

  it("renders research demo source label distinctly", () => {
    const html = renderToStaticMarkup(
      createElement(RuntimeStatusBadge, {
        label: "DEMO",
        tone: "DEMO",
        source: "RESEARCH_DEMO",
      }),
    );
    expect(html).toContain("Research Demo");
    expect(html).not.toMatch(/>\s*Live\s*</);
  });

  it("sourceLabel maps LIVE/MIXED/RESEARCH_DEMO", () => {
    expect(sourceLabel("LIVE")).toBe("Live");
    expect(sourceLabel("MIXED")).toBe("Mixed");
    expect(sourceLabel("RESEARCH_DEMO")).toBe("Research Demo");
  });
});

describe("Phase 2G · RuntimeModuleCard", () => {
  it("renders module, capability, warnings and diagnostics link", () => {
    const html = renderToStaticMarkup(createElement(RuntimeModuleCard, { evidence: ev }));
    expect(html).toContain("GTI");
    expect(html).toContain("COMPUTED");
    expect(html).toContain("Breadth is demo");
    expect(html).toContain("/market-breadth");
  });
});

describe("Phase 2G · RuntimeContradictionPanel", () => {
  it("returns nothing when list is empty", () => {
    const html = renderToStaticMarkup(
      createElement(RuntimeContradictionPanel, { contradictions: [] }),
    );
    expect(html).toBe("");
  });

  it("renders critical + warning items", () => {
    const html = renderToStaticMarkup(
      createElement(RuntimeContradictionPanel, {
        contradictions: [
          {
            code: "PCR_HEALTHY_WHILE_OPTIONS_BLOCKED",
            severity: "critical",
            modules: ["COMBINED_PCR", "OPTION_CHAIN_NIFTY"],
            message: "impossible",
          },
          {
            code: "PCR_READY_STATUS_MISMATCH",
            severity: "warning",
            modules: ["COMBINED_PCR"],
            message: "mismatch",
          },
        ],
      }),
    );
    expect(html).toContain("PCR_HEALTHY_WHILE_OPTIONS_BLOCKED");
    expect(html).toContain('data-severity="critical"');
    expect(html).toContain('data-severity="warning"');
  });
});

describe("Phase 2G · RuntimeReadinessSummary", () => {
  const report: RuntimeReadinessReport = {
    schemaVersion: 1,
    generatedAt: "2026-07-17T09:00:00.000Z",
    overall: "PARTIALLY_READY",
    criticalModules: ["OPTION_CHAIN_NIFTY"],
    evidence: [ev],
    blockers: [],
    warnings: ["GTI: Breadth demo"],
    contradictions: [],
    provenance: { modules: 1, healthy: 0, degraded: 0, blocked: 0, demo: 1 },
  };

  it("renders overall verdict badge and summary counts", () => {
    const html = renderToStaticMarkup(
      createElement(RuntimeReadinessSummary, { report }),
    );
    expect(html).toContain('data-overall="PARTIALLY_READY"');
    expect(html).toContain("PARTIALLY READY");
    expect(html).toContain("Modules");
    expect(html).toContain("GTI: Breadth demo");
  });

  it("compact mode omits module cards", () => {
    const html = renderToStaticMarkup(
      createElement(RuntimeReadinessSummary, { report, compact: true }),
    );
    expect(html).not.toContain('data-testid="runtime-module-card"');
  });
});