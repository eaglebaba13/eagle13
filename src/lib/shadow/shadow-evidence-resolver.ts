// Phase 23 · Stage 2 — Read-only research evidence resolver.
// Never reruns strategy/recommendation/portfolio engines. Callers pass
// pre-computed research artifacts; this resolver validates completeness.

import type {
  ShadowPolicy,
  ShadowPortfolioDecision,
  ShadowRecommendation,
} from "./shadow-types";

export type ResearchEvidenceInput = {
  readonly recommendation: ShadowRecommendation | null;
  readonly portfolio: ShadowPortfolioDecision | null;
  readonly regime?: string | null;
  readonly formulaAligned: boolean;
  readonly causalityOk: boolean;
  readonly strategiesAgree: boolean;
  readonly reliabilityAcceptable: boolean;
  readonly policy: ShadowPolicy;
};

export type ResolvedEvidence =
  | {
      readonly ok: true;
      readonly recommendation: ShadowRecommendation;
      readonly portfolio: ShadowPortfolioDecision | null;
      readonly regime: string | null;
      readonly formulaAligned: true;
      readonly causalityOk: true;
      readonly strategiesAgree: boolean;
      readonly reliabilityAcceptable: boolean;
      readonly policy: ShadowPolicy;
    }
  | {
      readonly ok: false;
      readonly status: "DATA_INCOMPLETE";
      readonly missing: readonly string[];
    };

export function resolveResearchEvidence(inp: ResearchEvidenceInput): ResolvedEvidence {
  const missing: string[] = [];
  if (!inp.recommendation) missing.push("RECOMMENDATION");
  if (!inp.formulaAligned) missing.push("FORMULA_ALIGNMENT");
  if (!inp.causalityOk) missing.push("CAUSALITY");
  if (!inp.reliabilityAcceptable) missing.push("RELIABILITY");
  if (missing.length > 0)
    return { ok: false, status: "DATA_INCOMPLETE", missing };
  return {
    ok: true,
    recommendation: inp.recommendation!,
    portfolio: inp.portfolio,
    regime: inp.regime ?? null,
    formulaAligned: true,
    causalityOk: true,
    strategiesAgree: inp.strategiesAgree,
    reliabilityAcceptable: inp.reliabilityAcceptable,
    policy: inp.policy,
  };
}