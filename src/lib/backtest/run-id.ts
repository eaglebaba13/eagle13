// Phase 21.3 · Canonical Run-ID for unified backtests. Deterministic and
// dependency-free (FNV-1a 32-bit). Formula-version is baked into the prefix
// so IDs from different formulas can never collide.

import type { UnifiedFormulaId } from "./result";

function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export type UnifiedRunIdInput = {
  formulaVersion: UnifiedFormulaId;
  instrument: string;
  from: string;
  to: string;
  policy: string;
  ambiguousPolicy: string;
  costs: {
    slippagePct: number;
    brokerageFlat: number;
    brokeragePct: number;
    taxesPct: number;
  };
  source: string;
  dataGranularity: string;
  engineVersion: string;
  executionVersion: string;
  cubeVersion: string;
  policyVersion: string;
  ingestVersion?: string;
};

export function computeUnifiedRunId(cfg: UnifiedRunIdInput): string {
  const key = [
    cfg.formulaVersion,
    cfg.instrument,
    cfg.from,
    cfg.to,
    cfg.policy,
    cfg.ambiguousPolicy,
    cfg.costs.slippagePct,
    cfg.costs.brokerageFlat,
    cfg.costs.brokeragePct,
    cfg.costs.taxesPct,
    cfg.source,
    cfg.dataGranularity,
    cfg.engineVersion,
    cfg.executionVersion,
    cfg.cubeVersion,
    cfg.policyVersion,
    cfg.ingestVersion ?? "",
  ].join("|");
  return `${cfg.formulaVersion}:${fnv1a(key)}`;
}
