// Phase 21.4 · Stage 4A — verify the /backtest terminal does not eagerly
// import SMC modules and that SMC dispatch stays confined to the lazy panel.
// Deterministic, network-free — inspects file contents only.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const backtestRoute = readFileSync("src/routes/backtest.tsx", "utf8");
const panel = readFileSync(
  "src/components/backtest/SmcBacktestPanel.tsx",
  "utf8",
);

describe("Phase 21.4 Stage 4A · SMC panel dispatch on /backtest", () => {
  it("mounts the SMC panel via React.lazy (no eager import)", () => {
    expect(backtestRoute).toMatch(
      /lazy\(\s*\(\)\s*=>\s*import\(\s*["']@\/components\/backtest\/SmcBacktestPanel["']/,
    );
    expect(backtestRoute).not.toMatch(
      /^import\s+.*SmcBacktestPanel.*from\s+["']@\/components\/backtest\/SmcBacktestPanel["'];?$/m,
    );
  });

  it("does NOT statically import SMC-only modules in the shared route", () => {
    for (const mod of [
      "smc-engine",
      "smc-signal-engine",
      "smc-data-source",
      "smc-historical.adapter",
      "candle-csv-parser",
      "candle-data-quality",
    ]) {
      expect(backtestRoute).not.toContain(mod);
    }
  });

  it("SMC panel calls each pure engine exactly once per run", () => {
    expect(panel.match(/analyzeSmc\(/g)?.length ?? 0).toBe(1);
    expect(panel.match(/analyzeSmcSignals\(/g)?.length ?? 0).toBe(1);
    expect(panel.match(/loadSmcCandles\(/g)?.length ?? 0).toBe(1);
    expect(panel.match(/runUnifiedBacktest\(/g)?.length ?? 0).toBe(1);
  });

  it("guards against overlapping runs (ref-based single-flight)", () => {
    expect(panel).toMatch(/runningRef\.current/);
  });

  it("SMC panel routes through unified runner, never runBacktest", () => {
    expect(panel).toContain("runUnifiedBacktest");
    expect(panel).not.toContain("runBacktest");
  });
});