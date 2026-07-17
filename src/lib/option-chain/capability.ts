// Phase 2B — Canonical Option Chain capability model.
//
// Maps a raw `GetOptionChainResult` (server-fn envelope) plus optional
// expiry validation into one deterministic capability state consumable by
// `/options-chain` and downstream diagnostics. Additive: does not modify
// provider interfaces, formulas, query keys or cache namespaces.

import type { OptionChainSnapshot, OptionUnderlying } from "./types";
import type { QualityReport } from "./data-quality";
import type { OptionChainProviderMeta } from "./provider";
import { safeProviderLabel, redactRawProviderRefs } from "@/lib/provider-labels";

export type OptionChainCapabilityStatus =
  | "SUPPORTED"
  | "PARTIAL"
  | "AUTH_REQUIRED"
  | "NO_DATA"
  | "INVALID_RESPONSE"
  | "STALE"
  | "INVALID_EXPIRY"
  | "NO_STRIKES"
  | "PARTIAL_CHAIN"
  | "DATA_QUALITY_FAILURE"
  | "UNSUPPORTED"
  | "PROVIDER_ERROR";

export type CapabilityStage =
  | "input"
  | "expiry-validation"
  | "provider-fetch"
  | "response-validation"
  | "snapshot-normalization"
  | "quality-assessment"
  | "ui-render";

export interface OptionChainCapability {
  readonly status: OptionChainCapabilityStatus;
  readonly retryable: boolean;
  readonly reason: string;
  readonly failingStage: CapabilityStage | null;
  readonly suggestedAction: string;
  readonly providerAlias: string;
  readonly observedAt: string;
  readonly latencyMs: number | null;
  readonly underlying: OptionUnderlying;
  readonly requestedExpiry: string | null;
  readonly resolvedExpiry: string | null;
}

export interface EvaluateCapabilityInput {
  readonly underlying: OptionUnderlying;
  readonly requestedExpiry: string | null;
  readonly ok: boolean;
  readonly snapshot: OptionChainSnapshot | null;
  readonly quality: QualityReport | null;
  readonly meta: OptionChainProviderMeta | null;
  readonly nowIso?: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidExpiryFormat(expiry: string | null | undefined): boolean {
  if (!expiry) return true;
  if (!ISO_DATE.test(expiry)) return false;
  return Number.isFinite(Date.parse(`${expiry}T00:00:00Z`));
}

type BaseFields = Omit<OptionChainCapability, "status" | "retryable" | "reason" | "failingStage" | "suggestedAction">;

function base(input: EvaluateCapabilityInput, now: string): BaseFields {
  return {
    providerAlias: safeProviderLabel(null, "OPTIONS"),
    observedAt: input.meta?.fetchedAt ?? now,
    latencyMs: input.meta?.latencyMs ?? null,
    underlying: input.underlying,
    requestedExpiry: input.requestedExpiry,
    resolvedExpiry: input.snapshot?.expiry ?? null,
  };
}

export function evaluateOptionChainCapability(input: EvaluateCapabilityInput): OptionChainCapability {
  const now = input.nowIso ?? new Date().toISOString();
  const b = base(input, now);

  if (!isValidExpiryFormat(input.requestedExpiry)) {
    return {
      ...b,
      status: "INVALID_EXPIRY",
      retryable: true,
      reason: `Requested expiry "${input.requestedExpiry ?? ""}" is not a valid YYYY-MM-DD date.`,
      failingStage: "expiry-validation",
      suggestedAction: "Pick another expiry from the dropdown.",
    };
  }

  if (!input.ok || !input.snapshot) {
    const providerStatus = input.meta?.status;
    const rawErr = input.meta?.safeError ?? "";
    const errText = redactRawProviderRefs(rawErr);
    if (providerStatus === "AUTH_REQUIRED") {
      return {
        ...b,
        status: "AUTH_REQUIRED",
        retryable: true,
        reason: "Options provider requires re-authentication.",
        failingStage: "provider-fetch",
        suggestedAction: "Reconnect the options provider from Broker / Settings.",
      };
    }
    if (/empty option chain/i.test(rawErr)) {
      return {
        ...b,
        status: "NO_DATA",
        retryable: true,
        reason: "Provider returned an empty option chain for this selection.",
        failingStage: "response-validation",
        suggestedAction: "Try a different expiry or retry after market open.",
      };
    }
    if (providerStatus === "STALE") {
      return {
        ...b,
        status: "STALE",
        retryable: true,
        reason: errText || "Provider snapshot is stale.",
        failingStage: "provider-fetch",
        suggestedAction: "Retry — the provider may recover shortly.",
      };
    }
    return {
      ...b,
      status: "PROVIDER_ERROR",
      retryable: true,
      reason: errText || "Options provider unavailable.",
      failingStage: "provider-fetch",
      suggestedAction: "Retry, or check Admin → Providers.",
    };
  }

  const snap = input.snapshot;
  if (!snap.expiry || !snap.timestamp) {
    return {
      ...b,
      status: "INVALID_RESPONSE",
      retryable: true,
      reason: "Provider response is missing expiry or timestamp.",
      failingStage: "response-validation",
      suggestedAction: "Retry the fetch.",
    };
  }
  if (snap.strikes.length === 0) {
    return {
      ...b,
      status: "NO_STRIKES",
      retryable: true,
      reason: "Snapshot contains zero strikes.",
      failingStage: "snapshot-normalization",
      suggestedAction: "Try another expiry or retry.",
    };
  }

  const q = input.quality;
  if (q) {
    const fails = q.issues.filter((i) => i.severity === "FAIL");
    if (fails.some((f) => f.code === "INSUFFICIENT_STRIKES")) {
      return {
        ...b,
        status: "PARTIAL_CHAIN",
        retryable: true,
        reason: fails.find((f) => f.code === "INSUFFICIENT_STRIKES")?.detail ?? "Insufficient strikes.",
        failingStage: "quality-assessment",
        suggestedAction: "Widen ATM filter or pick another expiry.",
      };
    }
    if (fails.some((f) => f.code === "FUTURE_TIMESTAMP")) {
      return {
        ...b,
        status: "INVALID_RESPONSE",
        retryable: true,
        reason: "Snapshot timestamp is in the future.",
        failingStage: "response-validation",
        suggestedAction: "Retry; provider clock may be skewed.",
      };
    }
    if (fails.length > 0) {
      return {
        ...b,
        status: "DATA_QUALITY_FAILURE",
        retryable: true,
        reason: fails.map((f) => f.code).join(", "),
        failingStage: "quality-assessment",
        suggestedAction: "Review data-quality issues in the Research Panel.",
      };
    }
    if (q.issues.length > 0) {
      return {
        ...b,
        status: "PARTIAL",
        retryable: true,
        reason: `${q.issues.length} data-quality warning(s).`,
        failingStage: "quality-assessment",
        suggestedAction: "Snapshot is usable; check warnings in Research Panel.",
      };
    }
  }
  if (snap.dataQuality === "PARTIAL") {
    return {
      ...b,
      status: "PARTIAL",
      retryable: true,
      reason: "Provider marked snapshot as partial.",
      failingStage: "provider-fetch",
      suggestedAction: "Snapshot is usable but incomplete.",
    };
  }

  return {
    ...b,
    status: "SUPPORTED",
    retryable: false,
    reason: "Live option chain available.",
    failingStage: null,
    suggestedAction: "",
  };
}
