// Phase 22 · Stage 1 — Portfolio Run ID. FNV-1a 32-bit, deterministic.

import type { PortfolioAsset, PortfolioConfig } from "./portfolio-types";
import { PORTFOLIO_RUN_ID_PREFIX } from "./portfolio-types";

function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function computePortfolioRunId(
  assets: readonly PortfolioAsset[],
  config: PortfolioConfig,
  dataHashes: readonly string[] = [],
): string {
  const parts: string[] = [];
  for (const a of assets) {
    parts.push([
      a.runId,
      a.formulaVersion,
      a.instrument,
      a.timeframe,
      a.from,
      a.to,
      a.dataHash ?? "",
    ].join(":"));
  }
  const cfgKey = JSON.stringify({
    m: config.method,
    cw: config.customWeights ?? null,
    sc: config.startingCapital,
    sp: config.sizingPolicy,
    rb: config.rebalancePolicy,
    rt: config.rebalanceThreshold ?? null,
    cn: config.constraints,
    co: config.costs,
    vl: config.volLookbackDays ?? null,
  });
  const key = [...parts, cfgKey, dataHashes.join("|")].join("||");
  return `${PORTFOLIO_RUN_ID_PREFIX}:${fnv1a(key)}`;
}