// Phase 3B — Canonical context builder. Pure. Fed from adapter output.

import type {
  CanonicalContext,
  EvidenceFreshness,
  EvidenceItem,
  StrategyContextView,
} from "./types";
import type { CanonicalBias } from "@/lib/option-strategy-terminal/types";

function mapFreshness(source: string | undefined | null): EvidenceFreshness {
  const s = (source ?? "").toUpperCase();
  if (s === "LIVE") return "LIVE";
  if (s === "MIXED") return "MIXED";
  if (s === "RESEARCH_DEMO") return "RESEARCH_DEMO";
  if (s === "STALE") return "STALE";
  return "UNKNOWN";
}

export interface ContextInputs {
  readonly generatedAt: string;
  readonly decision: {
    readonly available: boolean;
    readonly bias: CanonicalBias;
    readonly action?: string;
    readonly confidence?: number | null;
    readonly source?: string;
  };
  readonly pcr: { readonly available: boolean; readonly bias: CanonicalBias; readonly direction?: string; readonly source?: string };
  readonly gti: { readonly available: boolean; readonly bias: CanonicalBias; readonly state?: string; readonly source?: string };
  readonly breadth: { readonly available: boolean; readonly bias: CanonicalBias; readonly state?: string; readonly source?: string };
  readonly astro: { readonly available: boolean; readonly bias: CanonicalBias; readonly source?: string };
  readonly gann: { readonly available: boolean; readonly bias: CanonicalBias; readonly source?: string };
  readonly gannGap: { readonly available: boolean; readonly bias: CanonicalBias; readonly label?: string; readonly source?: string };
  readonly vix: { readonly available: boolean; readonly value: number | null; readonly regime: string };
  readonly strategy: StrategyContextView;
  readonly runtime: {
    readonly overall: "READY" | "PARTIALLY_READY" | "NOT_READY" | "UNKNOWN";
    readonly degradedModules: readonly string[];
  };
}

export function buildCanonicalContext(input: ContextInputs): CanonicalContext {
  const evidence: EvidenceItem[] = [
    {
      module: "DECISION_ENGINE",
      available: input.decision.available,
      bias: input.decision.bias,
      freshness: mapFreshness(input.decision.source),
      detail: input.decision.action ? `Action: ${input.decision.action}` : "Decision Engine",
    },
    {
      module: "COMBINED_PCR",
      available: input.pcr.available,
      bias: input.pcr.bias,
      freshness: mapFreshness(input.pcr.source),
      detail: input.pcr.direction ? `Direction: ${input.pcr.direction}` : "Combined PCR",
    },
    {
      module: "GTI",
      available: input.gti.available,
      bias: input.gti.bias,
      freshness: mapFreshness(input.gti.source),
      detail: input.gti.state ?? "GTI",
    },
    {
      module: "MARKET_BREADTH",
      available: input.breadth.available,
      bias: input.breadth.bias,
      freshness: mapFreshness(input.breadth.source),
      detail: input.breadth.state ?? "Breadth",
    },
    {
      module: "ASTRO",
      available: input.astro.available,
      bias: input.astro.bias,
      freshness: mapFreshness(input.astro.source),
      detail: "Astro alignment",
    },
    {
      module: "GANN",
      available: input.gann.available,
      bias: input.gann.bias,
      freshness: mapFreshness(input.gann.source),
      detail: "Gann levels",
    },
    {
      module: "GANN_GAP_OUTLOOK",
      available: input.gannGap.available,
      bias: input.gannGap.bias,
      freshness: mapFreshness(input.gannGap.source),
      detail: input.gannGap.label ?? "Gann Gap",
    },
    {
      module: "INDIA_VIX",
      available: input.vix.available,
      bias: "NEUTRAL",
      freshness: input.vix.available ? "LIVE" : "UNKNOWN",
      detail: `VIX ${input.vix.value ?? "-"} (${input.vix.regime})`,
    },
  ];

  return {
    generatedAt: input.generatedAt,
    evidence,
    vix: input.vix.value,
    vixRegime: input.vix.regime,
    strategy: input.strategy,
    runtime: input.runtime,
  };
}