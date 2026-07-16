// Phase 22 · Stage 3 — Risk budget engine. Compares target risk
// contribution vs actual, per candidate and per group (strategy /
// instrument / timeframe / regime). Research-only.

import type {
  PortfolioAsset,
  RiskContribution,
} from "./portfolio-types";

export type BudgetScope = "ASSET" | "STRATEGY" | "INSTRUMENT" | "TIMEFRAME" | "REGIME";

export type RiskBudgetInput = {
  readonly assets: readonly PortfolioAsset[];
  readonly contributions: readonly RiskContribution[];
  /** Scope determining how contributions are grouped. Default ASSET. */
  readonly scope?: BudgetScope;
  /** Explicit target map (0..1 shares, should sum ≤ 1). Missing keys default to equal. */
  readonly targets?: Readonly<Record<string, number>>;
  /** Tolerance for breach classification (absolute). Default 0.05. */
  readonly tolerance?: number;
};

export type RiskBudgetRow = {
  readonly key: string;
  readonly target: number;
  readonly actual: number;
  readonly gap: number;
  readonly breach: "OK" | "OVER" | "UNDER";
  readonly suggestion: string;
};

export type RiskBudgetResult = {
  readonly scope: BudgetScope;
  readonly tolerance: number;
  readonly rows: readonly RiskBudgetRow[];
  readonly compliance: number; // fraction of rows within tolerance
  readonly worstBreach: number;
  readonly totalTarget: number;
  readonly disclaimer: string;
};

function groupKey(asset: PortfolioAsset, scope: BudgetScope): string {
  switch (scope) {
    case "STRATEGY": return asset.strategy;
    case "INSTRUMENT": return asset.instrument;
    case "TIMEFRAME": return asset.timeframe;
    case "REGIME": return asset.regime ?? "UNSPECIFIED";
    default: return asset.id;
  }
}

export function computeRiskBudget(input: RiskBudgetInput): RiskBudgetResult {
  const scope = input.scope ?? "ASSET";
  const tolerance = input.tolerance ?? 0.05;
  const map = new Map<string, { actual: number }>();
  for (const rc of input.contributions) {
    const asset = input.assets.find((a) => a.id === rc.assetId);
    if (!asset) continue;
    const k = groupKey(asset, scope);
    const entry = map.get(k) ?? { actual: 0 };
    entry.actual += rc.volPct;
    map.set(k, entry);
  }
  const keys = [...map.keys()].sort();
  const targets = input.targets ?? {};
  const equal = keys.length > 0 ? 1 / keys.length : 0;
  let totalTarget = 0;
  const rows: RiskBudgetRow[] = keys.map((k) => {
    const target = targets[k] != null ? Math.max(0, targets[k]) : equal;
    totalTarget += target;
    const actual = map.get(k)!.actual;
    const gap = actual - target;
    const breach: RiskBudgetRow["breach"] =
      Math.abs(gap) <= tolerance ? "OK" : gap > 0 ? "OVER" : "UNDER";
    const suggestion =
      breach === "OK"
        ? "within tolerance"
        : breach === "OVER"
          ? `reduce risk allocation to ${k}`
          : `increase research coverage for ${k}`;
    return { key: k, target, actual, gap, breach, suggestion };
  });
  const okCount = rows.filter((r) => r.breach === "OK").length;
  const compliance = rows.length > 0 ? okCount / rows.length : 1;
  const worstBreach = rows.reduce((m, r) => Math.max(m, Math.abs(r.gap)), 0);
  return {
    scope,
    tolerance,
    rows,
    compliance,
    worstBreach,
    totalTarget,
    disclaimer:
      "PORTFOLIO RESEARCH ONLY — risk-budget analytics do not modify live sizing.",
  };
}