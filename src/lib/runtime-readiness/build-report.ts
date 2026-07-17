// Phase 2G — Pure runtime-readiness report builder.
//
// Deterministic mapping from already-fetched canonical inputs to a
// full `RuntimeReadinessReport`. No I/O. Server collector wraps this
// with data fetching; tests exercise this directly.

import type { OptionChainCapability } from "@/lib/option-chain/capability";
import type { MarketBreadthCapability } from "@/lib/market-breadth/capability";
import type { CombinedPcrReading } from "@/lib/combined-pcr/types";
import {
  evidenceFromOptionChain,
  evidenceFromCombinedPcr,
  evidenceFromMarketBreadth,
  evidenceFromGti,
  evidenceFromSimple,
  type RuntimeEvidence,
} from "./runtime-evidence";
import {
  aggregateRuntimeReadiness,
  type RuntimeReadinessReport,
} from "./runtime-readiness";

export interface BuildRuntimeReportInput {
  readonly nowIso: string;
  readonly quotesAvailable: boolean;
  readonly vixAvailable: boolean;
  readonly niftyCapability: OptionChainCapability | null;
  readonly banknifyCapability: OptionChainCapability | null;
  readonly combinedPcr: CombinedPcrReading | null;
  readonly breadthCapability: MarketBreadthCapability | null;
  readonly gtiComputed: boolean;
  readonly gannGap?: {
    readonly available: boolean;
    readonly demo?: boolean;
    readonly reason: string;
  } | null;
  readonly optionStrategyTerminal?: {
    readonly available: boolean;
    readonly demo?: boolean;
    readonly reason: string;
  } | null;
  readonly aiMarketAssistant?: {
    readonly available: boolean;
    readonly demo?: boolean;
    readonly reason: string;
  } | null;
}

export function buildRuntimeReadinessReport(
  input: BuildRuntimeReportInput,
): RuntimeReadinessReport {
  const now = input.nowIso;
  const evidence: RuntimeEvidence[] = [];

  evidence.push(
    evidenceFromSimple({
      module: "MARKET_DATA",
      available: input.quotesAvailable,
      reason: input.quotesAvailable ? "Quotes available" : "Quotes unavailable",
      observedAt: now,
      diagnosticsPath: "/admin/providers",
      provenance: "QUOTES",
    }),
  );
  evidence.push(
    evidenceFromSimple({
      module: "INDIA_VIX",
      available: input.vixAvailable,
      reason: input.vixAvailable ? "India VIX live" : "India VIX unavailable",
      observedAt: now,
      diagnosticsPath: "/admin/providers",
      provenance: "QUOTES",
    }),
  );

  const niftyEv = input.niftyCapability
    ? evidenceFromOptionChain("OPTION_CHAIN_NIFTY", input.niftyCapability)
    : evidenceFromSimple({
        module: "OPTION_CHAIN_NIFTY",
        available: false,
        reason: "NIFTY option chain unavailable",
        observedAt: now,
        diagnosticsPath: "/options-chain",
        provenance: "OPTIONS",
      });
  const bnkEv = input.banknifyCapability
    ? evidenceFromOptionChain("OPTION_CHAIN_BANKNIFTY", input.banknifyCapability)
    : evidenceFromSimple({
        module: "OPTION_CHAIN_BANKNIFTY",
        available: false,
        reason: "BANKNIFTY option chain unavailable",
        observedAt: now,
        diagnosticsPath: "/options-chain",
        provenance: "OPTIONS",
      });
  evidence.push(niftyEv, bnkEv);

  evidence.push(
    evidenceFromCombinedPcr({
      reading: input.combinedPcr,
      niftyCap: input.niftyCapability,
      banknifyCap: input.banknifyCapability,
      observedAt: now,
      providerAlias: "OPTIONS",
    }),
  );

  const decisionUsable =
    input.combinedPcr != null &&
    (input.niftyCapability?.status === "SUPPORTED" ||
      input.niftyCapability?.status === "PARTIAL" ||
      input.banknifyCapability?.status === "SUPPORTED" ||
      input.banknifyCapability?.status === "PARTIAL");
  const decisionHealthy =
    input.combinedPcr != null &&
    input.niftyCapability?.status === "SUPPORTED" &&
    input.banknifyCapability?.status === "SUPPORTED";
  evidence.push(
    evidenceFromSimple({
      module: "DECISION_ENGINE",
      available: decisionUsable,
      demo: decisionUsable && !decisionHealthy,
      reason: decisionUsable
        ? decisionHealthy
          ? "Decision inputs healthy"
          : "Decision running on partial inputs"
        : "Decision blocked — options/PCR unavailable",
      observedAt: now,
      diagnosticsPath: "/decision",
      provenance: "DECISION",
    }),
  );

  const breadthEv = input.breadthCapability
    ? evidenceFromMarketBreadth(input.breadthCapability)
    : evidenceFromSimple({
        module: "MARKET_BREADTH",
        available: false,
        reason: "Breadth capability unavailable",
        observedAt: now,
        diagnosticsPath: "/market-breadth",
        provenance: "BREADTH",
      });
  evidence.push(breadthEv);
  evidence.push(evidenceFromGti(breadthEv, input.gtiComputed, now));

  if (input.gannGap) {
    evidence.push(
      evidenceFromSimple({
        module: "GANN_GAP_OUTLOOK",
        available: input.gannGap.available,
        demo: input.gannGap.demo,
        reason: input.gannGap.reason,
        observedAt: now,
        diagnosticsPath: "/gann-gap-outlook",
        provenance: "GANN_GAP",
      }),
    );
  }

  if (input.optionStrategyTerminal) {
    evidence.push(
      evidenceFromSimple({
        module: "OPTION_STRATEGY_TERMINAL",
        available: input.optionStrategyTerminal.available,
        demo: input.optionStrategyTerminal.demo,
        reason: input.optionStrategyTerminal.reason,
        observedAt: now,
        diagnosticsPath: "/live-option-terminal",
        provenance: "OPTION_STRATEGY",
      }),
    );
  }

  if (input.aiMarketAssistant) {
    evidence.push(
      evidenceFromSimple({
        module: "AI_MARKET_ASSISTANT",
        available: input.aiMarketAssistant.available,
        demo: input.aiMarketAssistant.demo,
        reason: input.aiMarketAssistant.reason,
        observedAt: now,
        diagnosticsPath: "/ai-market-assistant",
        provenance: "AI_ASSISTANT",
      }),
    );
  }

  return aggregateRuntimeReadiness(evidence, { generatedAt: now });
}