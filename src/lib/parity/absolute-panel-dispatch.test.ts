// Phase 21.3d-β2b · Verify the /backtest terminal dispatches Absolute-Degree
// runs to `runHistoricalValidation` (not `runBacktest`) and that the daily
// bundle does not eagerly pull in the Absolute-only CSV / validation
// modules. Deterministic, network-free — inspects file contents only.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const backtestRoute = readFileSync("src/routes/backtest.tsx", "utf8");
const panel = readFileSync(
  "src/components/backtest/AbsoluteValidationPanel.tsx",
  "utf8",
);

describe("Phase 21.3d-β2b · Absolute panel dispatch on /backtest", () => {
  it("mounts the shared Absolute panel via React.lazy (no eager import)", () => {
    expect(backtestRoute).toMatch(
      /lazy\(\s*\(\)\s*=>\s*import\(\s*["']@\/components\/backtest\/AbsoluteValidationPanel["']/,
    );
    // No static/top-level import of the panel would bypass lazy loading.
    expect(backtestRoute).not.toMatch(
      /^import\s+.*AbsoluteValidationPanel.*from\s+["']@\/components\/backtest\/AbsoluteValidationPanel["'];?$/m,
    );
  });

  it("does NOT statically import Absolute-only modules in the daily route", () => {
    for (const mod of [
      "gann-intraday-history.functions",
      "gann-intraday-validation-export",
      "candle-csv-parser",
      "candle-data-quality",
      "candle-session-builder",
      "provider-comparison",
      "historical-ingest-export",
      "readiness-gate",
    ]) {
      expect(backtestRoute).not.toContain(mod);
    }
  });

  it("Absolute panel dispatches through runHistoricalValidation, not runBacktest", () => {
    expect(panel).toContain("runHistoricalValidation");
    expect(panel).not.toContain("runBacktest");
  });

  it("guards against overlapping runs (single request per Run click)", () => {
    expect(panel).toMatch(/if\s*\(\s*loading\s*\)\s*return;/);
  });

  it("Sign-Degree + Legacy still dispatch through runBacktest wrapper", () => {
    expect(backtestRoute).toContain("useServerFn(runBacktest)");
    // Legacy branch still passes astroFormulaVersion, Sign-Degree omits it.
    expect(backtestRoute).toContain("LEGACY_EAGLEBABA_CASCADE_V1");
  });

  it("surfaces the validation-only disclaimer inside the panel", () => {
    expect(panel).toContain("VALIDATION ONLY — NOT A LIVE TRADE RECOMMENDATION.");
  });
});