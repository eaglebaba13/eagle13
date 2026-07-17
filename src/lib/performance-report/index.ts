// Phase 29 · Stage 1 — Deterministic performance audit report.

export interface LatencySamples {
  readonly count: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly max: number;
}

export interface PerfInputs {
  readonly quotes: LatencySamples;
  readonly optionChain: LatencySamples;
  readonly combinedPcr: LatencySamples;
  readonly breadth: LatencySamples;
  readonly cacheHitRatio: number;
  readonly duplicateFetches: number;
  readonly hydrationErrors: number;
  readonly bundleKb: number;
}

export type PerfGrade = "GREEN" | "YELLOW" | "RED";

export interface PerfReport {
  readonly grade: PerfGrade;
  readonly quotes: PerfGrade;
  readonly optionChain: PerfGrade;
  readonly combinedPcr: PerfGrade;
  readonly breadth: PerfGrade;
  readonly cache: PerfGrade;
  readonly bundle: PerfGrade;
  readonly duplicateFetches: PerfGrade;
  readonly hydration: PerfGrade;
  readonly warnings: readonly string[];
  readonly formulaVersion: string;
}

export const PERF_REPORT_VERSION = "perf-report@1.0.0";

function latencyGrade(l: LatencySamples, t: { yellow: number; red: number }): PerfGrade {
  if (l.p95 >= t.red) return "RED";
  if (l.p95 >= t.yellow) return "YELLOW";
  return "GREEN";
}

function worst(...g: PerfGrade[]): PerfGrade {
  if (g.includes("RED")) return "RED";
  if (g.includes("YELLOW")) return "YELLOW";
  return "GREEN";
}

export function computePerfReport(inp: PerfInputs): PerfReport {
  const warnings: string[] = [];
  const quotes = latencyGrade(inp.quotes, { yellow: 400, red: 900 });
  const optionChain = latencyGrade(inp.optionChain, { yellow: 900, red: 1800 });
  const combinedPcr = latencyGrade(inp.combinedPcr, { yellow: 800, red: 1600 });
  const breadth = latencyGrade(inp.breadth, { yellow: 1200, red: 2500 });
  const cache: PerfGrade =
    inp.cacheHitRatio >= 0.7 ? "GREEN" : inp.cacheHitRatio >= 0.5 ? "YELLOW" : "RED";
  const bundle: PerfGrade =
    inp.bundleKb <= 750 ? "GREEN" : inp.bundleKb <= 1200 ? "YELLOW" : "RED";
  const duplicateFetches: PerfGrade =
    inp.duplicateFetches === 0 ? "GREEN" : inp.duplicateFetches <= 2 ? "YELLOW" : "RED";
  const hydration: PerfGrade = inp.hydrationErrors === 0 ? "GREEN" : "RED";
  if (duplicateFetches !== "GREEN") warnings.push("duplicate_provider_fetches_detected");
  if (cache !== "GREEN") warnings.push("cache_hit_ratio_below_target");
  if (hydration === "RED") warnings.push("hydration_errors_present");
  return {
    grade: worst(quotes, optionChain, combinedPcr, breadth, cache, bundle, duplicateFetches, hydration),
    quotes, optionChain, combinedPcr, breadth, cache, bundle, duplicateFetches, hydration,
    warnings, formulaVersion: PERF_REPORT_VERSION,
  };
}