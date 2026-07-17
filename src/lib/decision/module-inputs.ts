// Phase 2D · Decision Engine · pure wiring helpers.
//
// PURE (no I/O, no imports of server-only helpers). Consumes a canonical
// option-chain envelope (produced by `fetchCanonicalOptionChain`) and,
// where applicable, an already-computed CombinedPcrReading, and emits
// deterministic capability blocks + module inputs for the Decision
// engine.
//
// This helper NEVER performs another provider fetch and NEVER recomputes
// PCR from an independent option payload. Combined PCR must be computed
// once by the caller on the same canonical snapshots and passed in here.
//
// Formulas are unchanged — this file only maps canonical capability
// states to the existing `ModuleCapability` enum and to the arguments
// consumed by `optionsSignal` / `pcrSignal`.

import type {
  OptionChainCapability,
  OptionChainCapabilityStatus,
} from "../option-chain/capability";
import type { OptionChainProviderMeta } from "../option-chain/provider";
import type {
  OptionChainSnapshot as CanonicalSnapshot,
  OptionUnderlying,
} from "../option-chain/types";
import type { OptionsChainResponse } from "../options-chain.functions";
import type { CombinedPcrReading } from "../combined-pcr/types";
import { safeProviderLabel } from "@/lib/provider-labels";
import {
  adaptUpstoxToLegacyChain,
  isAdaptedChainLive,
} from "./live-chain-adapter";
import {
  explainCapability,
  isCapabilityLive,
  type CapabilityExplainer,
  type ModuleCapability,
} from "./capability";

/** Envelope shape produced by `fetchCanonicalOptionChain`. */
export interface CanonicalChainEnvelope {
  readonly ok: boolean;
  readonly snapshot: CanonicalSnapshot | null;
  readonly meta: OptionChainProviderMeta;
  readonly capability: OptionChainCapability;
}

function canonicalStatusToModule(
  status: OptionChainCapabilityStatus,
): ModuleCapability {
  switch (status) {
    case "SUPPORTED":
      return "SUPPORTED";
    case "PARTIAL":
    case "PARTIAL_CHAIN":
      return status === "PARTIAL_CHAIN" ? "PARTIAL_CHAIN" : "PARTIAL";
    case "AUTH_REQUIRED":
      return "AUTH_REQUIRED";
    case "NO_DATA":
      return "NO_DATA";
    case "INVALID_RESPONSE":
      return "INVALID_RESPONSE";
    case "STALE":
      return "STALE";
    case "INVALID_EXPIRY":
      return "INVALID_EXPIRY";
    case "NO_STRIKES":
      return "NO_STRIKES";
    case "DATA_QUALITY_FAILURE":
      return "DATA_QUALITY_FAILURE";
    case "UNSUPPORTED":
    case "PROVIDER_ERROR":
    default:
      return "UNSUPPORTED";
  }
}

export interface OptionsModuleInput {
  readonly underlying: OptionUnderlying;
  readonly usable: boolean;
  readonly chain: OptionsChainResponse | null;
  readonly capability: ModuleCapability;
  readonly canonicalStatus: OptionChainCapabilityStatus;
  readonly explainer: CapabilityExplainer;
  readonly providerAlias: string;
  readonly fetchedAt: string | null;
  readonly latencyMs: number | null;
  readonly freshnessSec: number | null;
  readonly expiry: string | null;
  readonly strikeCount: number;
  readonly safeError: string | null;
  readonly reason: string;
  readonly suggestedAction: string;
  readonly retryable: boolean;
  readonly failingStage: OptionChainCapability["failingStage"];
}

/**
 * Adapt a canonical envelope to the Options module input consumed by
 * `optionsSignal`. When the canonical capability is not usable the
 * result carries `usable=false` and a structured capability block —
 * `optionsSignal` should NOT be invoked in that case, so the pure engine
 * can redistribute weights transparently (no fake zero, no fake neutral).
 */
export function buildOptionsModuleInput(
  underlying: OptionUnderlying,
  canonical: CanonicalChainEnvelope,
  nowIso: string = new Date().toISOString(),
): OptionsModuleInput {
  const now = new Date(nowIso);
  const canonicalStatus = canonical.capability.status;
  const providerAlias = safeProviderLabel(null, "OPTIONS");

  // If canonical says the chain is not delivered, short-circuit before
  // running the legacy adapter — there is nothing to adapt.
  const canonicalUsable =
    canonicalStatus === "SUPPORTED" || canonicalStatus === "PARTIAL";
  if (!canonicalUsable || !canonical.ok || !canonical.snapshot) {
    const mod = canonicalStatusToModule(canonicalStatus);
    return {
      underlying,
      usable: false,
      chain: null,
      capability: mod,
      canonicalStatus,
      explainer: explainCapability(mod, {
        module: "options",
        stage: canonical.capability.failingStage ?? "provider-fetch",
        provider: providerAlias,
      }),
      providerAlias,
      fetchedAt: canonical.meta.fetchedAt ?? null,
      latencyMs: canonical.meta.latencyMs ?? null,
      freshnessSec: null,
      expiry: canonical.snapshot?.expiry ?? null,
      strikeCount: canonical.snapshot?.strikes.length ?? 0,
      safeError: canonical.meta.safeError ?? null,
      reason: canonical.capability.reason,
      suggestedAction: canonical.capability.suggestedAction,
      retryable: canonical.capability.retryable,
      failingStage: canonical.capability.failingStage,
    };
  }

  // Reuse the existing adapter to keep the legacy-shape chain unchanged
  // for `optionsSignal` and PCR-legs computation.
  const adapted = adaptUpstoxToLegacyChain(
    underlying,
    { ok: canonical.ok, snapshot: canonical.snapshot, meta: canonical.meta },
    now,
  );
  const usable = isAdaptedChainLive(adapted);
  const freshnessSec =
    canonical.snapshot?.timestamp != null
      ? Math.max(
          0,
          Math.round(
            (now.getTime() - new Date(canonical.snapshot.timestamp).getTime()) /
              1000,
          ),
        )
      : null;

  return {
    underlying,
    usable,
    chain: adapted.chain,
    capability: adapted.capability,
    canonicalStatus,
    explainer: {
      ...adapted.explainer,
      provider: providerAlias,
    },
    providerAlias,
    fetchedAt: canonical.meta.fetchedAt ?? null,
    latencyMs: canonical.meta.latencyMs ?? null,
    freshnessSec,
    expiry: canonical.snapshot.expiry ?? null,
    strikeCount: canonical.snapshot.strikes.length,
    safeError: canonical.meta.safeError ?? null,
    reason: canonical.capability.reason,
    suggestedAction: canonical.capability.suggestedAction,
    retryable: canonical.capability.retryable,
    failingStage: canonical.capability.failingStage,
  };
}

export interface PcrModuleInput {
  readonly usable: boolean;
  readonly computed: boolean;
  readonly pcrOi: number | null;
  readonly capability: ModuleCapability;
  readonly canonicalStatus: OptionChainCapabilityStatus;
  readonly explainer: CapabilityExplainer;
  readonly providerAlias: string;
  readonly combinedScore: number | null;
  readonly direction: "CE" | "NEUTRAL" | "PE" | null;
  readonly reason: string;
  readonly suggestedAction: string;
  readonly formulaVersion: string;
  readonly instrumentCount: number;
  readonly reading: CombinedPcrReading | null;
}

/**
 * Derive the PCR module input from the already-computed Combined PCR
 * reading. Never fetches a provider, never recomputes PCR from another
 * payload. When Combined PCR is not computable (e.g. Options capability
 * is blocked), the block propagates the exact reason.
 */
export function buildPcrModuleInput(
  optionsInput: OptionsModuleInput,
  reading: CombinedPcrReading | null,
): PcrModuleInput {
  const providerAlias = safeProviderLabel(null, "OPTIONS");

  // If NIFTY options are not usable, PCR cannot be computed reliably from
  // the canonical snapshot for the primary underlying. Propagate the
  // exact canonical status so the UI shows the same reason.
  if (!optionsInput.usable) {
    const mod = optionsInput.capability;
    return {
      usable: false,
      computed: false,
      pcrOi: null,
      capability: mod,
      canonicalStatus: optionsInput.canonicalStatus,
      explainer: explainCapability(mod, {
        module: "pcr",
        stage: "derived-from-options",
        provider: providerAlias,
      }),
      providerAlias,
      combinedScore: null,
      direction: null,
      reason: optionsInput.reason,
      suggestedAction: optionsInput.suggestedAction,
      formulaVersion: "combined-pcr@1.0.0",
      instrumentCount: 0,
      reading: null,
    };
  }

  if (reading == null) {
    return {
      usable: false,
      computed: false,
      pcrOi: null,
      capability: "NO_DATA",
      canonicalStatus: optionsInput.canonicalStatus,
      explainer: explainCapability("NO_DATA", {
        module: "pcr",
        stage: "combined-pcr-compute",
        provider: providerAlias,
      }),
      providerAlias,
      combinedScore: null,
      direction: null,
      reason: "Combined PCR could not be computed from the canonical snapshot.",
      suggestedAction: "Retry once option chain returns SUPPORTED.",
      formulaVersion: "combined-pcr@1.0.0",
      instrumentCount: 0,
      reading: null,
    };
  }

  const nifty = reading.instruments.find((i) => i.underlying === "NIFTY");
  const pcrOi = nifty?.rawOiPcr ?? null;
  if (pcrOi == null) {
    return {
      usable: false,
      computed: true,
      pcrOi: null,
      capability: "PARTIAL_CHAIN",
      canonicalStatus: optionsInput.canonicalStatus,
      explainer: explainCapability("PARTIAL_CHAIN", {
        module: "pcr",
        stage: "instrument-aggregation",
        provider: providerAlias,
      }),
      providerAlias,
      combinedScore: reading.combinedScore,
      direction: reading.direction,
      reason:
        "Combined PCR computed but NIFTY OI-PCR is missing — cannot feed pcrSignal.",
      suggestedAction: "Wait for full chain publication and retry.",
      formulaVersion: "combined-pcr@1.0.0",
      instrumentCount: reading.instruments.length,
      reading,
    };
  }

  const cap: ModuleCapability = isCapabilityLive(optionsInput.capability)
    ? "SUPPORTED"
    : optionsInput.capability;
  return {
    usable: true,
    computed: true,
    pcrOi,
    capability: cap,
    canonicalStatus: optionsInput.canonicalStatus,
    explainer: explainCapability(cap, {
      module: "pcr",
      stage: "derived-from-options",
      provider: providerAlias,
    }),
    providerAlias,
    combinedScore: reading.combinedScore,
    direction: reading.direction,
    reason: `Combined PCR ready · NIFTY OI-PCR ${pcrOi.toFixed(2)}`,
    suggestedAction: "",
    formulaVersion: "combined-pcr@1.0.0",
    instrumentCount: reading.instruments.length,
    reading,
  };
}

/**
 * Compact Decision summary intended for later dashboard embedding. Pure
 * data shape — the dashboard card is NOT mounted yet in this phase.
 */
export interface DecisionSummary {
  readonly decision: string;
  readonly confidence: number;
  readonly risk: string;
  readonly moduleCoverage: { readonly present: number; readonly total: number };
  readonly options: {
    readonly status: OptionChainCapabilityStatus;
    readonly reason: string;
    readonly providerAlias: string;
    readonly freshnessSec: number | null;
  };
  readonly pcr: {
    readonly status: OptionChainCapabilityStatus;
    readonly reason: string;
    readonly computed: boolean;
    readonly pcrOi: number | null;
    readonly combinedScore: number | null;
  };
  readonly generatedAt: string;
}

export function buildDecisionSummary(args: {
  action: string;
  confidence: number;
  risk: string;
  present: number;
  total: number;
  options: OptionsModuleInput;
  pcr: PcrModuleInput;
  generatedAt: string;
}): DecisionSummary {
  return {
    decision: args.action,
    confidence: args.confidence,
    risk: args.risk,
    moduleCoverage: { present: args.present, total: args.total },
    options: {
      status: args.options.canonicalStatus,
      reason: args.options.reason,
      providerAlias: args.options.providerAlias,
      freshnessSec: args.options.freshnessSec,
    },
    pcr: {
      status: args.pcr.canonicalStatus,
      reason: args.pcr.reason,
      computed: args.pcr.computed,
      pcrOi: args.pcr.pcrOi,
      combinedScore: args.pcr.combinedScore,
    },
    generatedAt: args.generatedAt,
  };
}