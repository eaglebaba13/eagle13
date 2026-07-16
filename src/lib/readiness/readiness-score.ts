import type {
  ReadinessCategory,
  ReadinessResult,
  ReadinessScore,
  ReadinessScoreCategory,
} from "./production-readiness-types";

const CATEGORY_WEIGHTS: Record<ReadinessCategory, number> = {
  SECURITY: 20,
  DATA: 8,
  DATABASE: 12,
  PAYMENTS: 10,
  PROVIDERS: 12,
  OPERATIONS: 10,
  OBSERVABILITY: 8,
  RECOVERY: 10,
  BUILD: 6,
  GOVERNANCE: 4,
};

export function computeReadinessScore(results: readonly ReadinessResult[]): ReadinessScore {
  const categories: ReadinessScoreCategory[] = [];
  let hardBlockerCount = 0;
  let totalWeighted = 0;
  let totalWeight = 0;
  const cats = Object.keys(CATEGORY_WEIGHTS) as ReadinessCategory[];
  for (const c of cats) {
    const subset = results.filter((r) => r.category === c);
    const pass = subset.filter((r) => r.status === "PASS").length;
    const warn = subset.filter((r) => r.status === "WARNING").length;
    const fail = subset.filter((r) => r.status === "FAIL" || r.status === "MISSING").length;
    const applicable = pass + warn + fail;
    const score = applicable === 0 ? 100 : Math.round(((pass + 0.5 * warn) / applicable) * 100);
    const weight = CATEGORY_WEIGHTS[c];
    categories.push({ category: c, score, weight, passCount: pass, warnCount: warn, failCount: fail });
    totalWeighted += score * weight;
    totalWeight += weight;
  }
  hardBlockerCount = results.filter((r) => r.hardBlocker).length;
  const total = totalWeight === 0 ? 0 : Math.round(totalWeighted / totalWeight);
  return {
    total,
    categories,
    hardBlockerCount,
    overrideBlocked: hardBlockerCount > 0,
  };
}
