// Phase 2H — Runtime readiness strip + diagnostics unit tests.

import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  RuntimeReadinessStrip,
  RuntimeReadinessStripFallback,
} from "./RuntimeReadinessStrip";
import { RuntimeReadinessDiagnostics } from "./RuntimeReadinessDiagnostics";
import type { RuntimeReadinessReport } from "@/lib/runtime-readiness/runtime-readiness";
import {
  redactRuntimeReadinessReport,
  exportRuntimeReadinessJson,
} from "@/lib/runtime-readiness/diagnostics-export";

function baseReport(overall: RuntimeReadinessReport["overall"]): RuntimeReadinessReport {
  return {
    schemaVersion: 1,
    generatedAt: "2026-07-17T09:00:00.000Z",
    overall,
    criticalModules: ["MARKET_DATA"],
    evidence: [],
    blockers: overall === "NOT_READY" ? ["MARKET_DATA: quotes unavailable"] : [],
    warnings: overall === "PARTIALLY_READY" ? ["MARKET_BREADTH: demo"] : [],
    contradictions: [],
    provenance: {
      modules: 8,
      healthy: overall === "READY" ? 8 : 4,
      degraded: overall === "PARTIALLY_READY" ? 2 : 0,
      blocked: overall === "NOT_READY" ? 3 : 0,
      demo: overall === "PARTIALLY_READY" ? 1 : 0,
    },
  };
}

describe("Phase 2H · RuntimeReadinessStrip", () => {
  it("renders READY verdict with live counters", () => {
    const html = renderToStaticMarkup(
      createElement(RuntimeReadinessStrip, { report: baseReport("READY") }),
    );
    expect(html).toContain('data-overall="READY"');
    expect(html).toContain("Live");
    expect(html).toContain("Diagnostics");
  });

  it("renders NOT_READY with blocker count", () => {
    const html = renderToStaticMarkup(
      createElement(RuntimeReadinessStrip, { report: baseReport("NOT_READY") }),
    );
    expect(html).toContain('data-overall="NOT_READY"');
    expect(html).toContain("Blockers");
  });

  it("renders PARTIALLY_READY with demo/warning chips", () => {
    const html = renderToStaticMarkup(
      createElement(RuntimeReadinessStrip, { report: baseReport("PARTIALLY_READY") }),
    );
    expect(html).toContain('data-overall="PARTIALLY_READY"');
    expect(html).toContain("Demo");
    expect(html).toContain("Warnings");
  });

  it("fallback exposes UNAVAILABLE badge and reason", () => {
    const html = renderToStaticMarkup(
      createElement(RuntimeReadinessStripFallback, { reason: "Unauthorized" }),
    );
    expect(html).toContain("UNAVAILABLE");
    expect(html).toContain("Unauthorized");
    expect(html).toContain("Diagnostics");
  });
});

describe("Phase 2H · RuntimeReadinessDiagnostics", () => {
  it("renders empty state without a report", () => {
    const html = renderToStaticMarkup(
      createElement(RuntimeReadinessDiagnostics, { report: null }),
    );
    expect(html).toContain("No runtime evidence available");
  });

  it("renders JSON block when report is present", () => {
    const html = renderToStaticMarkup(
      createElement(RuntimeReadinessDiagnostics, { report: baseReport("READY") }),
    );
    expect(html).toContain("Runtime Evidence");
    expect(html).toContain("runtime-readiness-json");
    expect(html).toContain('"overall": "READY"');
  });
});

describe("Phase 2H · diagnostics-export redaction", () => {
  it("redacts URLs from evidence reasons/blockers/warnings", () => {
    const report: RuntimeReadinessReport = {
      ...baseReport("NOT_READY"),
      blockers: ["MARKET_DATA: see https://api.example.com/quotes?token=abc"],
      warnings: ["Fallback used at http://internal.local"],
      contradictions: [
        {
          code: "X",
          severity: "critical",
          modules: ["MARKET_DATA"],
          message: "Fetched from https://api.example.com/x",
        },
      ],
    };
    const redacted = redactRuntimeReadinessReport(report);
    const json = exportRuntimeReadinessJson(redacted);
    expect(json).not.toContain("api.example.com");
    expect(json).not.toContain("internal.local");
    expect(json).toContain("[redacted-url]");
  });

  it("scrubs secret-like keys via JSON replacer", () => {
    const report: RuntimeReadinessReport = baseReport("READY");
    // Inject a decorated object that includes a forbidden key.
    const contaminated = {
      ...report,
      extras: { authorization: "Bearer abc", api_key: "xyz", token: "t" },
    } as unknown as RuntimeReadinessReport;
    const json = exportRuntimeReadinessJson(contaminated);
    expect(json).not.toContain("Bearer abc");
    expect(json).not.toContain("xyz");
    expect(json.match(/\[redacted\]/g)?.length).toBeGreaterThanOrEqual(3);
  });
});