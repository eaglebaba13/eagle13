// Phase 2F — Canonical Runtime Evidence model.
//
// One provider-neutral evidence envelope shared by Launch Readiness,
// Beta Readiness, System Status, GTI Summary, Dashboard health, Option
// Chain, Combined PCR, Decision and Market Breadth surfaces. Pure — no
// I/O, no formulas, no provider fetches. Adapters map existing
// canonical envelopes (OptionChainCapability, MarketBreadthCapability,
// CombinedPcrReading, etc.) into `RuntimeEvidence` so every readiness
// consumer sees a single deterministic view.

import type { OptionChainCapability } from "@/lib/option-chain/capability";
import type { MarketBreadthCapability } from "@/lib/market-breadth/capability";
import type { CombinedPcrReading } from "@/lib/combined-pcr/types";

export const RUNTIME_EVIDENCE_SCHEMA_VERSION = 1;

export type ModuleStatus =
  | "HEALTHY"
  | "DEGRADED"
  | "BLOCKED"
  | "UNAVAILABLE"
  | "DEMO"
  | "UNKNOWN";

export type ModuleReadiness =
  | "READY"
  | "PARTIALLY_READY"
  | "NOT_READY"
  | "NOT_APPLICABLE";

export type ModuleSource =
  | "LIVE"
  | "MIXED"
  | "RESEARCH_DEMO"
  | "CONFIGURATION"
  | "STATIC"
  | "UNKNOWN";

export type ModuleId =
  | "MARKET_DATA"
  | "INDIA_VIX"
  | "OPTION_CHAIN_NIFTY"
  | "OPTION_CHAIN_BANKNIFTY"
  | "COMBINED_PCR"
  | "DECISION_ENGINE"
  | "MARKET_BREADTH"
  | "GTI"
  | "HISTORICAL_DATA"
  | "REPLAY"
  | "BACKTEST"
  | "RISK_MANAGER"
  | "BILLING"
  | "LICENSE"
  | "BROKER_CONNECTIVITY"
  | "GANN_GAP_OUTLOOK"
  | "OPTION_STRATEGY_TERMINAL"
  | "AI_MARKET_ASSISTANT"
  | "SMART_ALERT_ENGINE"
  | "INSTITUTIONAL_FLOW"
  | "RESEARCH_LAB";

export interface RuntimeEvidence {
  readonly module: ModuleId;
  readonly status: ModuleStatus;
  readonly readiness: ModuleReadiness;
  readonly source: ModuleSource;
  readonly capability: string;
  readonly freshness: "FRESH" | "STALE" | "UNKNOWN";
  readonly quality: "OK" | "PARTIAL" | "DEGRADED" | "FAILED" | "MISSING" | "UNKNOWN";
  readonly observedAt: string;
  readonly latencyMs: number | null;
  readonly reason: string;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly provenance: string;
  readonly diagnosticsPath: string | null;
}

// ─── Option Chain adapter ────────────────────────────────────────────
export function evidenceFromOptionChain(
  moduleId: "OPTION_CHAIN_NIFTY" | "OPTION_CHAIN_BANKNIFTY",
  cap: OptionChainCapability,
): RuntimeEvidence {
  const status: ModuleStatus =
    cap.status === "SUPPORTED"
      ? "HEALTHY"
      : cap.status === "PARTIAL" || cap.status === "PARTIAL_CHAIN"
        ? "DEGRADED"
        : cap.status === "STALE"
          ? "DEGRADED"
          : cap.status === "UNSUPPORTED"
            ? "UNAVAILABLE"
            : "BLOCKED";
  const readiness: ModuleReadiness =
    status === "HEALTHY"
      ? "READY"
      : status === "DEGRADED"
        ? "PARTIALLY_READY"
        : "NOT_READY";
  const blockers = status === "BLOCKED" ? [cap.reason] : [];
  const warnings = status === "DEGRADED" ? [cap.reason] : [];
  return {
    module: moduleId,
    status,
    readiness,
    source: status === "HEALTHY" || status === "DEGRADED" ? "LIVE" : "UNKNOWN",
    capability: cap.status,
    freshness: cap.status === "STALE" ? "STALE" : cap.status === "SUPPORTED" ? "FRESH" : "UNKNOWN",
    quality:
      cap.status === "SUPPORTED"
        ? "OK"
        : cap.status === "PARTIAL" || cap.status === "PARTIAL_CHAIN"
          ? "PARTIAL"
          : cap.status === "DATA_QUALITY_FAILURE"
            ? "FAILED"
            : cap.status === "NO_DATA" || cap.status === "NO_STRIKES"
              ? "MISSING"
              : "UNKNOWN",
    observedAt: cap.observedAt,
    latencyMs: cap.latencyMs,
    reason: cap.reason,
    blockers,
    warnings,
    provenance: cap.providerAlias,
    diagnosticsPath: "/admin/system-status",
  };
}

// ─── Combined PCR adapter ────────────────────────────────────────────
export interface CombinedPcrEvidenceInput {
  readonly reading: CombinedPcrReading | null;
  readonly niftyCap?: OptionChainCapability | null;
  readonly banknifyCap?: OptionChainCapability | null;
  readonly observedAt: string;
  readonly providerAlias?: string;
}

export function evidenceFromCombinedPcr(input: CombinedPcrEvidenceInput): RuntimeEvidence {
  const usableCount = [input.niftyCap, input.banknifyCap].filter(
    (c) => c && (c.status === "SUPPORTED" || c.status === "PARTIAL"),
  ).length;
  const anyBlocked = [input.niftyCap, input.banknifyCap].some(
    (c) => c && c.status !== "SUPPORTED" && c.status !== "PARTIAL",
  );
  const computed = input.reading != null && Number.isFinite(input.reading.combinedScore ?? NaN);
  let status: ModuleStatus;
  if (!computed) status = "BLOCKED";
  else if (usableCount === 2 && !anyBlocked) status = "HEALTHY";
  else if (usableCount >= 1) status = "DEGRADED";
  else status = "UNAVAILABLE";
  const readiness: ModuleReadiness =
    status === "HEALTHY" ? "READY" : status === "DEGRADED" ? "PARTIALLY_READY" : "NOT_READY";
  return {
    module: "COMBINED_PCR",
    status,
    readiness,
    source: computed ? (usableCount >= 1 ? "LIVE" : "UNKNOWN") : "UNKNOWN",
    capability: computed ? "COMPUTED" : "UNAVAILABLE",
    freshness: computed ? "FRESH" : "UNKNOWN",
    quality: computed
      ? usableCount === 2
        ? "OK"
        : "PARTIAL"
      : "MISSING",
    observedAt: input.observedAt,
    latencyMs: null,
    reason: computed ? `PCR computed from ${usableCount}/2 instruments` : "PCR not computed",
    blockers: computed ? [] : ["Combined PCR unavailable"],
    warnings: computed && usableCount < 2 ? ["Partial instrument coverage"] : [],
    provenance: input.providerAlias ?? "OPTIONS",
    diagnosticsPath: "/combined-pcr",
  };
}

// ─── Market Breadth adapter ──────────────────────────────────────────
export function evidenceFromMarketBreadth(cap: MarketBreadthCapability): RuntimeEvidence {
  const status: ModuleStatus =
    cap.status === "SUPPORTED"
      ? cap.source === "LIVE"
        ? "HEALTHY"
        : "DEMO"
      : cap.status === "PARTIAL"
        ? "DEGRADED"
        : cap.status === "STALE"
          ? "DEGRADED"
          : cap.status === "UNSUPPORTED"
            ? "UNAVAILABLE"
            : "BLOCKED";
  const readiness: ModuleReadiness =
    status === "HEALTHY"
      ? "READY"
      : status === "DEGRADED"
        ? "PARTIALLY_READY"
        : status === "DEMO"
          ? "NOT_READY"
          : "NOT_READY";
  return {
    module: "MARKET_BREADTH",
    status,
    readiness,
    source: cap.source,
    capability: cap.status,
    freshness: cap.freshness,
    quality:
      cap.status === "SUPPORTED"
        ? cap.source === "LIVE"
          ? "OK"
          : "PARTIAL"
        : cap.status === "PARTIAL"
          ? "PARTIAL"
          : cap.status === "DATA_QUALITY_FAILURE"
            ? "FAILED"
            : "MISSING",
    observedAt: cap.observedAt,
    latencyMs: cap.latencyMs,
    reason: cap.reason,
    blockers: status === "BLOCKED" ? [cap.reason] : [],
    warnings:
      status === "DEMO"
        ? ["Breadth constituents sourced from deterministic research mock"]
        : status === "DEGRADED"
          ? [cap.reason]
          : [],
    provenance: cap.providerAlias,
    diagnosticsPath: "/market-breadth",
  };
}

// ─── GTI adapter — inherits Market Breadth source ────────────────────
export function evidenceFromGti(
  breadth: RuntimeEvidence,
  computed: boolean,
  observedAt: string,
): RuntimeEvidence {
  if (!computed) {
    return {
      module: "GTI",
      status: "BLOCKED",
      readiness: "NOT_READY",
      source: "UNKNOWN",
      capability: "NOT_COMPUTED",
      freshness: "UNKNOWN",
      quality: "MISSING",
      observedAt,
      latencyMs: null,
      reason: "GTI not computed",
      blockers: ["GTI classifier did not produce a reading"],
      warnings: [],
      provenance: "BREADTH",
      diagnosticsPath: "/market-breadth",
    };
  }
  // GTI can never be more live than its breadth input.
  const source: ModuleSource = breadth.source;
  const status: ModuleStatus =
    breadth.status === "HEALTHY"
      ? "HEALTHY"
      : breadth.status === "DEMO"
        ? "DEMO"
        : breadth.status === "DEGRADED"
          ? "DEGRADED"
          : breadth.status;
  const readiness: ModuleReadiness =
    status === "HEALTHY"
      ? "READY"
      : status === "DEGRADED"
        ? "PARTIALLY_READY"
        : "NOT_READY";
  return {
    module: "GTI",
    status,
    readiness,
    source,
    capability: "COMPUTED",
    freshness: breadth.freshness,
    quality: breadth.quality,
    observedAt,
    latencyMs: null,
    reason:
      source === "LIVE"
        ? "GTI computed from live breadth inputs"
        : `GTI inherits breadth source ${source}`,
    blockers: breadth.blockers,
    warnings: breadth.warnings,
    provenance: breadth.provenance,
    diagnosticsPath: "/market-breadth",
  };
}

// ─── Simple generic adapter for feature-flag / store style modules ───
export interface SimpleEvidenceInput {
  readonly module: ModuleId;
  readonly available: boolean;
  readonly demo?: boolean;
  readonly reason: string;
  readonly observedAt: string;
  readonly diagnosticsPath?: string | null;
  readonly provenance?: string;
}

export function evidenceFromSimple(i: SimpleEvidenceInput): RuntimeEvidence {
  const status: ModuleStatus = !i.available ? "UNAVAILABLE" : i.demo ? "DEMO" : "HEALTHY";
  const readiness: ModuleReadiness =
    status === "HEALTHY" ? "READY" : status === "DEMO" ? "NOT_READY" : "NOT_READY";
  return {
    module: i.module,
    status,
    readiness,
    source: !i.available ? "UNKNOWN" : i.demo ? "RESEARCH_DEMO" : "CONFIGURATION",
    capability: i.available ? (i.demo ? "DEMO" : "CONFIGURED") : "UNAVAILABLE",
    freshness: "UNKNOWN",
    quality: i.available ? (i.demo ? "PARTIAL" : "OK") : "MISSING",
    observedAt: i.observedAt,
    latencyMs: null,
    reason: i.reason,
    blockers: !i.available ? [i.reason] : [],
    warnings: i.demo ? [`${i.module} is in DEMO/CONFIGURATION mode`] : [],
    provenance: i.provenance ?? "APP",
    diagnosticsPath: i.diagnosticsPath ?? null,
  };
}
