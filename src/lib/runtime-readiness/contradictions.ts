// Phase 2F — Deterministic contradiction detector.
// Pure. No I/O. Flags impossible cross-module states so overall
// readiness cannot claim READY while another module is BLOCKED.

import type { RuntimeEvidence, ModuleId } from "./runtime-evidence";

export interface Contradiction {
  readonly code: string;
  readonly severity: "critical" | "warning";
  readonly modules: readonly ModuleId[];
  readonly message: string;
}

function byId(evs: readonly RuntimeEvidence[]): Map<ModuleId, RuntimeEvidence> {
  const m = new Map<ModuleId, RuntimeEvidence>();
  for (const e of evs) m.set(e.module, e);
  return m;
}

export function detectContradictions(evs: readonly RuntimeEvidence[]): Contradiction[] {
  const out: Contradiction[] = [];
  const m = byId(evs);

  const nifty = m.get("OPTION_CHAIN_NIFTY");
  const bnk = m.get("OPTION_CHAIN_BANKNIFTY");
  const pcr = m.get("COMBINED_PCR");
  const decision = m.get("DECISION_ENGINE");
  const breadth = m.get("MARKET_BREADTH");
  const gti = m.get("GTI");

  // Options blocked but PCR / Decision claim healthy
  const optionsBlocked =
    (nifty?.status === "BLOCKED" || nifty?.status === "UNAVAILABLE") &&
    (bnk?.status === "BLOCKED" || bnk?.status === "UNAVAILABLE");
  if (optionsBlocked && pcr && pcr.status === "HEALTHY") {
    out.push({
      code: "PCR_HEALTHY_WHILE_OPTIONS_BLOCKED",
      severity: "critical",
      modules: ["COMBINED_PCR", "OPTION_CHAIN_NIFTY", "OPTION_CHAIN_BANKNIFTY"],
      message: "Combined PCR reports HEALTHY while both option-chain instruments are unavailable.",
    });
  }
  if (optionsBlocked && decision && decision.status === "HEALTHY") {
    out.push({
      code: "DECISION_HEALTHY_WHILE_OPTIONS_BLOCKED",
      severity: "critical",
      modules: ["DECISION_ENGINE", "OPTION_CHAIN_NIFTY", "OPTION_CHAIN_BANKNIFTY"],
      message: "Decision engine reports HEALTHY while option-chain foundation is blocked.",
    });
  }

  // Breadth demo but GTI claims fully live
  if (breadth && gti && breadth.source !== "LIVE" && gti.source === "LIVE") {
    out.push({
      code: "GTI_LIVE_WHILE_BREADTH_NOT_LIVE",
      severity: "critical",
      modules: ["GTI", "MARKET_BREADTH"],
      message: `GTI claims LIVE source while breadth source is ${breadth.source}.`,
    });
  }

  // PCR blocked but Combined PCR module says READY
  if (pcr && pcr.readiness === "READY" && pcr.status !== "HEALTHY") {
    out.push({
      code: "PCR_READY_STATUS_MISMATCH",
      severity: "warning",
      modules: ["COMBINED_PCR"],
      message: "Combined PCR marked READY without HEALTHY status.",
    });
  }

  // Static "READY" claim while blockers exist on same module
  for (const e of evs) {
    if (e.readiness === "READY" && e.blockers.length > 0) {
      out.push({
        code: "READY_WITH_BLOCKERS",
        severity: "critical",
        modules: [e.module],
        message: `${e.module} is READY but reports ${e.blockers.length} blocker(s).`,
      });
    }
  }

  return out;
}
