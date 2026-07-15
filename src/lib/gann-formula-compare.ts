// Phase 21.2 · Stage 5 — deterministic Run-ID computation and conflict
// classification across the three intraday methodologies. Read-only.

import {
  INTRADAY_FORMULA_VERSIONS,
  GANN_ABSOLUTE_INTRADAY_VALIDATION_VERSION,
  type IntradayFormulaVersion,
} from "./engine-version";

export type FormulaRunEnvelope = {
  formulaVersion: IntradayFormulaVersion;
  executionVersion: string;
  cubeVersion: string;
  policyVersion: string;
  runId: string;
  generatedAt: string;
};

function stableHash(input: string): string {
  // FNV-1a 32-bit — deterministic and dependency-free.
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function computeRunId(args: {
  formulaVersion: IntradayFormulaVersion;
  instrument: string;
  from: string;
  to: string;
  ambiguousPolicy: string;
  costs: { cost: number; slippage: number };
}): string {
  const key = [
    GANN_ABSOLUTE_INTRADAY_VALIDATION_VERSION,
    args.formulaVersion,
    args.instrument,
    args.from,
    args.to,
    args.ambiguousPolicy,
    args.costs.cost,
    args.costs.slippage,
  ].join("|");
  return `${args.formulaVersion}:${stableHash(key)}`;
}

export type Direction = "BUY" | "SELL" | "WAIT" | "NO_TRADE" | "UNKNOWN";
export type ConflictClass =
  | "BOTH_AGREE"
  | "PROD_BUY_ABS_SELL"
  | "PROD_SELL_ABS_BUY"
  | "PROD_BUY_ABS_WAIT"
  | "PROD_SELL_ABS_WAIT"
  | "PROD_WAIT_ABS_BUY"
  | "PROD_WAIT_ABS_SELL"
  | "DATA_INCOMPLETE";

export function classifyConflict(
  production: Direction,
  absolute: Direction,
): ConflictClass {
  if (production === "UNKNOWN" || absolute === "UNKNOWN") return "DATA_INCOMPLETE";
  if (production === absolute) return "BOTH_AGREE";
  if (production === "BUY" && absolute === "SELL") return "PROD_BUY_ABS_SELL";
  if (production === "SELL" && absolute === "BUY") return "PROD_SELL_ABS_BUY";
  if (production === "BUY" && (absolute === "WAIT" || absolute === "NO_TRADE"))
    return "PROD_BUY_ABS_WAIT";
  if (production === "SELL" && (absolute === "WAIT" || absolute === "NO_TRADE"))
    return "PROD_SELL_ABS_WAIT";
  if ((production === "WAIT" || production === "NO_TRADE") && absolute === "BUY")
    return "PROD_WAIT_ABS_BUY";
  if ((production === "WAIT" || production === "NO_TRADE") && absolute === "SELL")
    return "PROD_WAIT_ABS_SELL";
  return "DATA_INCOMPLETE";
}

export const FORMULA_VERSIONS_ALL = [
  INTRADAY_FORMULA_VERSIONS.GANN_ASTRO_INTRADAY_ABSOLUTE_V1,
  INTRADAY_FORMULA_VERSIONS.GANN_SIGN_DEGREE_TABLE_V1_1,
  INTRADAY_FORMULA_VERSIONS.LEGACY_EAGLEBABA_CASCADE_V1,
] as const;