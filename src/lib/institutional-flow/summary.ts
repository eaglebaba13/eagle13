// Phase 3D — Deterministic institutional-flow summary.
// Never advises trades. Only classifies the writer/positioning balance.

import type {
  AggregateBuildUp,
  FlowBias,
  InstitutionalSummary,
  MaxPainResult,
  OiAnalysis,
  CalcAvailability,
} from "./types";

export interface SummaryInput {
  readonly oi: OiAnalysis;
  readonly buildUp: AggregateBuildUp;
  readonly maxPain: MaxPainResult;
  readonly pcrScore: number | null;
}

export function summariseFlow(i: SummaryInput): InstitutionalSummary {
  const evidence: string[] = [];
  const rationale: string[] = [];

  if (i.oi.availability === "UNAVAILABLE") {
    return {
      bias: "UNAVAILABLE",
      headline: "Option OI unavailable",
      rationale: ["Snapshot missing call/put OI"],
      evidence: [],
      availability: "UNAVAILABLE",
    };
  }

  const call = i.oi.totalCallChangeOi ?? 0;
  const put = i.oi.totalPutChangeOi ?? 0;
  const pcr = i.pcrScore;

  evidence.push(`ΔCall OI ${Math.round(call)}`);
  evidence.push(`ΔPut OI ${Math.round(put)}`);
  if (pcr != null) evidence.push(`Combined PCR ${pcr.toFixed(2)}`);
  if (i.maxPain.currentMaxPain != null) evidence.push(`Max Pain ${i.maxPain.currentMaxPain}`);

  let bias: FlowBias = "BALANCED";
  const putDominant = put > call * 1.2 && put > 0;
  const callDominant = call > put * 1.2 && call > 0;
  const pcrBull = pcr != null && pcr >= 1.2;
  const pcrBear = pcr != null && pcr <= 0.8;

  if (putDominant && pcrBull) {
    bias = "PUT_WRITERS_ACTIVE";
    rationale.push("Put writers dominate ΔOI and PCR confirms bullish positioning.");
  } else if (callDominant && pcrBear) {
    bias = "CALL_WRITERS_ACTIVE";
    rationale.push("Call writers dominate ΔOI and PCR confirms bearish positioning.");
  } else if (putDominant) {
    bias = "PUT_WRITERS_ACTIVE";
    rationale.push("Put writers dominate ΔOI. PCR confirmation not aligned.");
  } else if (callDominant) {
    bias = "CALL_WRITERS_ACTIVE";
    rationale.push("Call writers dominate ΔOI. PCR confirmation not aligned.");
  } else if (pcrBull && callDominant) {
    bias = "CONFLICT";
    rationale.push("PCR bullish but call writers active — conflicting evidence.");
  } else if (pcrBear && putDominant) {
    bias = "CONFLICT";
    rationale.push("PCR bearish but put writers active — conflicting evidence.");
  } else {
    bias = "BALANCED";
    rationale.push("Neither side dominates ΔOI within tolerance.");
  }

  if (i.buildUp.availability !== "UNAVAILABLE") {
    rationale.push(`Build-up: ${i.buildUp.overall.replace(/_/g, " ").toLowerCase()}.`);
  }

  const availability: CalcAvailability =
    i.oi.availability === "OK" && (pcr != null) ? "OK" : "PARTIAL";

  const headline =
    bias === "PUT_WRITERS_ACTIVE" ? "Put writers active"
    : bias === "CALL_WRITERS_ACTIVE" ? "Call writers active"
    : bias === "CONFLICT" ? "Conflicting positioning"
    : bias === "BALANCED" ? "Balanced positioning"
    : "Positioning unavailable";

  return { bias, headline, rationale, evidence, availability };
}