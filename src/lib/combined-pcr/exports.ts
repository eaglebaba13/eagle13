// Phase 27 · Stage 1 — Combined PCR exports.
// CSV / JSON / Research Bundle carriers.

import { DISCLAIMER, FORMULA_VERSION, type CombinedPcrReading } from "./types";
import type { OptionChainCapability } from "../option-chain/capability";

function csvEscape(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function readingToCsv(r: CombinedPcrReading): string {
  const meta = [
    `# run_id=${r.runId}`,
    `# formula=${FORMULA_VERSION}`,
    `# timestamp=${r.timestamp}`,
    `# disclaimer=${DISCLAIMER}`,
  ].join("\n");
  const header = [
    "underlying",
    "raw_oi_pcr",
    "raw_change_oi_pcr",
    "norm_oi_pcr",
    "norm_change_oi_pcr",
    "instrument_score",
    "weight",
    "configured_weight",
    "strike_count",
    "atm",
    "expiry",
    "provider",
    "timestamp",
  ];
  const rows = r.instruments.map((i) => [
    i.underlying, i.rawOiPcr, i.rawChangeOiPcr,
    i.normalizedOiPcr, i.normalizedChangeOiPcr, i.instrumentScore,
    i.weight, i.configuredWeight, i.strikeCount, i.atm,
    i.expiry, i.provider, i.timestamp,
  ].map(csvEscape).join(","));
  const summary = [
    `# combined_score=${r.combinedScore ?? ""}`,
    `# direction=${r.direction}`,
    `# signal=${r.signalState}`,
    `# confirmed=${r.confirmedState}`,
    `# ema_fast=${r.emaFast ?? ""}`,
    `# ema_slow=${r.emaSlow ?? ""}`,
    `# slope=${r.slope ?? ""}`,
    `# slope_change=${r.slopeChange ?? ""}`,
  ].join("\n");
  return [meta, summary, header.join(","), ...rows].join("\n");
}

export function readingToJson(r: CombinedPcrReading): string {
  return JSON.stringify({ ...r, formulaVersion: FORMULA_VERSION, disclaimer: DISCLAIMER }, null, 2);
}

export interface CombinedPcrResearchBundle {
  readonly reading: CombinedPcrReading;
  readonly formulaVersion: string;
  readonly disclaimer: string;
  readonly generatedAt: string;
  readonly version: 1;
  readonly capabilities?: Readonly<Record<string, OptionChainCapability>>;
  readonly capabilityStatus?: OptionChainCapability["status"];
}

export function buildCombinedPcrResearchBundle(
  r: CombinedPcrReading,
  nowIso: string = new Date().toISOString(),
  capabilities?: Readonly<Record<string, OptionChainCapability>>,
  capabilityStatus?: OptionChainCapability["status"],
): CombinedPcrResearchBundle {
  return {
    reading: r,
    formulaVersion: FORMULA_VERSION,
    disclaimer: DISCLAIMER,
    generatedAt: nowIso,
    version: 1,
    ...(capabilities ? { capabilities } : {}),
    ...(capabilityStatus ? { capabilityStatus } : {}),
  };
}