// Phase 21.4 · Stage 4B — Astro + SMC Hybrid decision core.
//
// Pure, deterministic combination of an existing Astro directional signal
// and an existing SMC signal for the same session. Owns no market math and
// never fetches data. Direct directional conflicts (BUY vs SELL) can never
// be overridden by score — this is enforced at the top of the resolver.

import { INTRADAY_FORMULA_VERSIONS } from "../engine-version";

export const HYBRID_FORMULA_VERSION =
  INTRADAY_FORMULA_VERSIONS.ASTRO_SMC_HYBRID_V1;

export type HybridDirection =
  | "BUY"
  | "SELL"
  | "WAIT"
  | "CONFLICT"
  | "DATA_INCOMPLETE"
  | "FORMULA_MISMATCH";

export type HybridWeights = {
  astro: number;
  smc: number;
  agreement: number;
  dataQuality: number;
};

export const DEFAULT_HYBRID_WEIGHTS: HybridWeights = Object.freeze({
  astro: 0.4,
  smc: 0.4,
  agreement: 0.15,
  dataQuality: 0.05,
});

export type HybridConfig = {
  weights: HybridWeights;
  /** SMC score threshold (0..100) below which agreement resolves to WAIT. */
  scoreThreshold: number;
  /** Minimum data-quality coverage percent to permit a trade. */
  minDataQualityPct: number;
};

export const DEFAULT_HYBRID_CONFIG: HybridConfig = Object.freeze({
  weights: DEFAULT_HYBRID_WEIGHTS,
  scoreThreshold: 55,
  minDataQualityPct: 80,
});

export type AstroInput = {
  direction: "BUY" | "SELL" | "WAIT";
  /** Confidence 0..100. */
  confidence: number;
  formulaVersion: string;
  reasons?: readonly string[];
};

export type SmcInput = {
  signal: "BUY" | "SELL" | "WAIT" | "CONFLICT" | "INVALID";
  /** SMC signal score 0..100. */
  score: number;
  formulaVersion: string;
  triggeredRules?: readonly string[];
  missingRules?: readonly string[];
  reasons?: readonly string[];
};

export type HybridDecisionInput = {
  astro: AstroInput | null;
  smc: SmcInput | null;
  /** Coverage percent 0..100 for the session (data-quality). */
  dataQualityPct: number;
  expectedAstroFormula: string;
  expectedSmcFormula: string;
  config?: Partial<HybridConfig>;
};

export type HybridDecision = {
  direction: HybridDirection;
  hybridScore: number;
  astroContribution: number;
  smcContribution: number;
  agreementBonus: number;
  dataQualityContribution: number;
  reasons: readonly string[];
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function normaliseConfig(cfg?: Partial<HybridConfig>): HybridConfig {
  const merged: HybridConfig = {
    weights: { ...DEFAULT_HYBRID_WEIGHTS, ...(cfg?.weights ?? {}) },
    scoreThreshold: cfg?.scoreThreshold ?? DEFAULT_HYBRID_CONFIG.scoreThreshold,
    minDataQualityPct:
      cfg?.minDataQualityPct ?? DEFAULT_HYBRID_CONFIG.minDataQualityPct,
  };
  return merged;
}

/**
 * Pure resolver. Guarantees:
 *  1. Formula-version mismatch → FORMULA_MISMATCH.
 *  2. Missing astro or SMC input → DATA_INCOMPLETE.
 *  3. Direct BUY/SELL vs SELL/BUY → CONFLICT (never overridden by score).
 *  4. Agreement + score threshold + data-quality → BUY / SELL.
 *  5. Everything else → WAIT.
 */
export function deriveHybridDecision(input: HybridDecisionInput): HybridDecision {
  const cfg = normaliseConfig(input.config);
  const reasons: string[] = [];

  // Score components (always computed for transparency).
  const astroConf = input.astro?.confidence ?? 0;
  const smcScore = input.smc?.score ?? 0;
  const dq = Math.max(0, Math.min(100, input.dataQualityPct));

  const astroContribution = round2(astroConf * cfg.weights.astro);
  const smcContribution = round2(smcScore * cfg.weights.smc);
  const dataQualityContribution = round2(dq * cfg.weights.dataQuality);

  // Formula mismatch first — this is a wiring bug, not a market decision.
  if (
    input.astro &&
    input.astro.formulaVersion !== input.expectedAstroFormula
  ) {
    reasons.push(
      `FORMULA_MISMATCH: astro=${input.astro.formulaVersion} expected=${input.expectedAstroFormula}`,
    );
    return {
      direction: "FORMULA_MISMATCH",
      hybridScore: 0,
      astroContribution,
      smcContribution,
      agreementBonus: 0,
      dataQualityContribution,
      reasons,
    };
  }
  if (input.smc && input.smc.formulaVersion !== input.expectedSmcFormula) {
    reasons.push(
      `FORMULA_MISMATCH: smc=${input.smc.formulaVersion} expected=${input.expectedSmcFormula}`,
    );
    return {
      direction: "FORMULA_MISMATCH",
      hybridScore: 0,
      astroContribution,
      smcContribution,
      agreementBonus: 0,
      dataQualityContribution,
      reasons,
    };
  }

  if (!input.astro || !input.smc) {
    reasons.push("DATA_INCOMPLETE: missing astro or smc input");
    return {
      direction: "DATA_INCOMPLETE",
      hybridScore: 0,
      astroContribution,
      smcContribution,
      agreementBonus: 0,
      dataQualityContribution,
      reasons,
    };
  }

  const a = input.astro.direction;
  const s = input.smc.signal;

  // Direct directional conflict — score can never override.
  if ((a === "BUY" && s === "SELL") || (a === "SELL" && s === "BUY")) {
    reasons.push(`CONFLICT: astro=${a} smc=${s} (score cannot override)`);
    return {
      direction: "CONFLICT",
      hybridScore: 0,
      astroContribution,
      smcContribution,
      agreementBonus: 0,
      dataQualityContribution,
      reasons,
    };
  }

  const agrees =
    (a === "BUY" && s === "BUY") || (a === "SELL" && s === "SELL");
  const agreementBonus = agrees ? round2(100 * cfg.weights.agreement) : 0;
  const hybridScore = round2(
    astroContribution + smcContribution + agreementBonus + dataQualityContribution,
  );

  if (!agrees) {
    reasons.push(`WAIT: astro=${a} smc=${s} (no agreement)`);
    return {
      direction: "WAIT",
      hybridScore,
      astroContribution,
      smcContribution,
      agreementBonus,
      dataQualityContribution,
      reasons,
    };
  }

  if (smcScore < cfg.scoreThreshold) {
    reasons.push(
      `WAIT: smc score ${smcScore} < threshold ${cfg.scoreThreshold}`,
    );
    return {
      direction: "WAIT",
      hybridScore,
      astroContribution,
      smcContribution,
      agreementBonus,
      dataQualityContribution,
      reasons,
    };
  }

  if (dq < cfg.minDataQualityPct) {
    reasons.push(
      `WAIT: data-quality ${dq}% < minimum ${cfg.minDataQualityPct}%`,
    );
    return {
      direction: "WAIT",
      hybridScore,
      astroContribution,
      smcContribution,
      agreementBonus,
      dataQualityContribution,
      reasons,
    };
  }

  reasons.push(
    `AGREEMENT: astro=${a} smc=${s} score=${smcScore} dq=${dq}%`,
  );
  return {
    direction: agrees && a === "BUY" ? "BUY" : "SELL",
    hybridScore,
    astroContribution,
    smcContribution,
    agreementBonus,
    dataQualityContribution,
    reasons,
  };
}

/** Bucket labels for the signal-alignment analytics grid. */
export type HybridAlignmentBucket =
  | "ASTRO_BUY_SMC_BUY"
  | "ASTRO_SELL_SMC_SELL"
  | "ASTRO_BUY_SMC_SELL"
  | "ASTRO_SELL_SMC_BUY"
  | "ASTRO_WAIT_SMC_BUY"
  | "ASTRO_WAIT_SMC_SELL"
  | "ASTRO_BUY_SMC_WAIT"
  | "ASTRO_SELL_SMC_WAIT"
  | "DATA_INCOMPLETE";

export function bucketFor(
  astro: AstroInput["direction"] | null,
  smc: SmcInput["signal"] | null,
): HybridAlignmentBucket {
  if (!astro || !smc) return "DATA_INCOMPLETE";
  if (astro === "BUY" && smc === "BUY") return "ASTRO_BUY_SMC_BUY";
  if (astro === "SELL" && smc === "SELL") return "ASTRO_SELL_SMC_SELL";
  if (astro === "BUY" && smc === "SELL") return "ASTRO_BUY_SMC_SELL";
  if (astro === "SELL" && smc === "BUY") return "ASTRO_SELL_SMC_BUY";
  if (astro === "WAIT" && smc === "BUY") return "ASTRO_WAIT_SMC_BUY";
  if (astro === "WAIT" && smc === "SELL") return "ASTRO_WAIT_SMC_SELL";
  if (astro === "BUY" && smc === "WAIT") return "ASTRO_BUY_SMC_WAIT";
  if (astro === "SELL" && smc === "WAIT") return "ASTRO_SELL_SMC_WAIT";
  return "DATA_INCOMPLETE";
}