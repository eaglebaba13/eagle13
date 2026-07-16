// Phase 27 · Stage 2 — SENSEX option-chain capability gate.
//
// Provider-neutral evaluator. Given a candidate snapshot (or null), decide
// whether SENSEX can be safely activated. SENSEX stays UNSUPPORTED until
// every required field passes.
//
// Research-only. No broker paths.

import type { OptionChainSnapshot } from "../option-chain/types";

export type SensexCapabilityStatus =
  | "SUPPORTED"
  | "PARTIAL"
  | "UNSUPPORTED"
  | "AUTH_REQUIRED"
  | "STALE"
  | "DATA_QUALITY_FAILURE";

export interface SensexCapabilityField {
  readonly field: string;
  readonly ok: boolean;
  readonly detail?: string;
}

export interface SensexCapabilityReport {
  readonly status: SensexCapabilityStatus;
  readonly provider: string;
  readonly fields: readonly SensexCapabilityField[];
  readonly missing: readonly string[];
  readonly safeError: string | null;
  readonly activate: false; // hard gate — always false until wired
  readonly evaluatedAt: string;
}

export interface AssessSensexInput {
  readonly snapshot: OptionChainSnapshot | null;
  readonly providerId: string;
  readonly safeError?: string | null;
  readonly upstreamCode?: string | null;
  readonly nowMs?: number;
  readonly staleMs?: number;
  readonly minStrikes?: number;
}

function field(name: string, ok: boolean, detail?: string): SensexCapabilityField {
  return { field: name, ok, detail };
}

export function assessSensexCapability(input: AssessSensexInput): SensexCapabilityReport {
  const nowMs = input.nowMs ?? Date.now();
  const staleMs = input.staleMs ?? 5 * 60 * 1000;
  const minStrikes = input.minStrikes ?? 10;
  const provider = input.providerId;
  const evaluatedAt = new Date(nowMs).toISOString();

  if (input.upstreamCode === "AUTH_REQUIRED" || input.safeError === "AUTH_REQUIRED") {
    return {
      status: "AUTH_REQUIRED", provider,
      fields: [], missing: ["auth"],
      safeError: input.safeError ?? "auth required",
      activate: false, evaluatedAt,
    };
  }

  if (!input.snapshot) {
    return {
      status: "UNSUPPORTED", provider,
      fields: [field("snapshot", false, "no data")],
      missing: ["snapshot"],
      safeError: input.safeError ?? "no snapshot",
      activate: false, evaluatedAt,
    };
  }

  const s = input.snapshot;
  let callOi = 0, putOi = 0, callCh = 0, putCh = 0;
  for (const st of s.strikes) {
    if (st.call.oi != null) callOi += 1;
    if (st.put.oi != null) putOi += 1;
    if (st.call.changeOi != null) callCh += 1;
    if (st.put.changeOi != null) putCh += 1;
  }
  const tsMs = Date.parse(s.timestamp);
  const freshOk = Number.isFinite(tsMs) && nowMs - tsMs <= staleMs;

  const fields: SensexCapabilityField[] = [
    field("option_chain", s.strikes.length > 0, `${s.strikes.length} strikes`),
    field("expiry", typeof s.expiry === "string" && s.expiry.length > 0),
    field("strike_coverage", s.strikes.length >= minStrikes, `min=${minStrikes}`),
    field("call_oi", callOi >= minStrikes, `covered=${callOi}`),
    field("put_oi", putOi >= minStrikes, `covered=${putOi}`),
    field("call_change_oi", callCh >= minStrikes, `covered=${callCh}`),
    field("put_change_oi", putCh >= minStrikes, `covered=${putCh}`),
    field("spot_price", s.spotPrice != null && s.spotPrice > 0),
    field("timestamp", freshOk, freshOk ? undefined : "stale/absent"),
  ];

  const missing = fields.filter((f) => !f.ok).map((f) => f.field);
  const dqFail = s.dataQuality === "FAILED";
  const stale = s.dataQuality === "STALE" || (!freshOk && s.strikes.length > 0);

  let status: SensexCapabilityStatus;
  if (dqFail) status = "DATA_QUALITY_FAILURE";
  else if (stale) status = "STALE";
  else if (missing.length === 0) status = "SUPPORTED";
  else if (missing.length >= fields.length - 1) status = "UNSUPPORTED";
  else status = "PARTIAL";

  return {
    status, provider, fields, missing,
    safeError: input.safeError ?? null,
    activate: false, // gate stays closed by contract
    evaluatedAt,
  };
}