// Phase 27 · Stage 3 — Exports for GTI research readings.

import type { GtiResearchReading, MarketBreadthSnapshot } from "./types";
import type { MarketBreadthCapability } from "./capability";
import { MARKET_BREADTH_DISCLAIMER } from "./types";

function csvRow(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function snapshotRow(s: MarketBreadthSnapshot | null, label: string): string[] {
  if (!s) return [label, "", "", "", "", "", "", "", ""];
  return [
    label,
    s.universe,
    String(s.totalSymbols),
    String(s.advances),
    String(s.declines),
    String(s.unchanged),
    (s.constituentCoverage ?? 0).toFixed(3),
    (s.weightedBreadth ?? "").toString(),
    s.dataQuality,
  ];
}

export function readingToCsv(r: GtiResearchReading): string {
  const header = ["label", "universe", "total", "advances", "declines", "unchanged", "coverage", "weightedBreadth", "quality"];
  const rows: string[][] = [
    header,
    snapshotRow(r.breadth.broad, "BROAD"),
    snapshotRow(r.breadth.nifty50, "NIFTY50"),
    snapshotRow(r.breadth.topWeighted, "TOP_WEIGHTED"),
    ...r.breadth.sectors.map((s) => snapshotRow(s, s.universe)),
  ];
  const meta = [
    ["# research bundle"],
    [`# formula=${r.formulaVersion}`],
    [`# state=${r.state}`],
    [`# confidence=${r.confidence}`],
    [`# runId=${r.runId}`],
    [`# timestamp=${r.timestamp}`],
    [`# disclaimer=${MARKET_BREADTH_DISCLAIMER}`],
  ];
  return [...meta, ...rows].map((cols) => cols.map(csvRow).join(",")).join("\n") + "\n";
}

export function readingToJson(r: GtiResearchReading): string {
  return JSON.stringify(r, null, 2);
}

export function buildResearchBundle(
  r: GtiResearchReading,
  extras?: {
    readonly capability?: MarketBreadthCapability | null;
    readonly providerAlias?: string | null;
    readonly breadthSource?: string | null;
  },
): Record<string, unknown> {
  return {
    formulaVersion: r.formulaVersion,
    disclaimer: MARKET_BREADTH_DISCLAIMER,
    runId: r.runId,
    timestamp: r.timestamp,
    state: r.state,
    confidence: r.confidence,
    confidenceBreakdown: r.confidenceBreakdown,
    conflicts: r.conflicts,
    vix: r.vix,
    pcr: r.pcr,
    breadth: r.breadth,
    warnings: r.warnings,
    capability: extras?.capability ?? null,
    providerAlias: extras?.providerAlias ?? null,
    breadthSource: extras?.breadthSource ?? null,
  };
}
