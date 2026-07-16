// Phase 26 · Stage 5 — Data quality checker.
//
// Detects: missing expiry, duplicate strike, zero OI, negative OI,
// timestamp mismatch, provider stale, spot missing, <5 strikes,
// partial snapshot, future timestamp. Never throws.

import type { OptionChainSnapshot } from "./types";

export type QualityCode =
  | "MISSING_EXPIRY"
  | "DUPLICATE_STRIKE"
  | "ZERO_OI"
  | "NEGATIVE_OI"
  | "TIMESTAMP_MISMATCH"
  | "PROVIDER_STALE"
  | "SPOT_MISSING"
  | "INSUFFICIENT_STRIKES"
  | "PARTIAL_SNAPSHOT"
  | "FUTURE_TIMESTAMP";

export type QualitySeverity = "INFO" | "WARN" | "FAIL";

export interface QualityIssue {
  readonly code: QualityCode;
  readonly severity: QualitySeverity;
  readonly detail: string;
}

export interface QualityReport {
  readonly ok: boolean;
  readonly issues: readonly QualityIssue[];
  readonly checkedAt: string;
}

export interface QualityOptions {
  readonly nowIso?: string;
  readonly staleMs?: number;      // default 5 min
  readonly minStrikes?: number;   // default 5
  readonly futureToleranceMs?: number; // default 60s
}

export function assessDataQuality(
  snapshot: OptionChainSnapshot,
  opts: QualityOptions = {},
): QualityReport {
  const nowIso = opts.nowIso ?? new Date().toISOString();
  const staleMs = opts.staleMs ?? 5 * 60 * 1000;
  const minStrikes = opts.minStrikes ?? 5;
  const futureToleranceMs = opts.futureToleranceMs ?? 60_000;
  const issues: QualityIssue[] = [];

  if (!snapshot.expiry) issues.push({ code: "MISSING_EXPIRY", severity: "FAIL", detail: "expiry not present" });
  if (snapshot.spotPrice == null) issues.push({ code: "SPOT_MISSING", severity: "FAIL", detail: "spot price null" });

  const seen = new Set<number>();
  let zeroOi = 0;
  let negativeOi = 0;
  let partial = 0;
  for (const s of snapshot.strikes) {
    if (seen.has(s.strike)) {
      issues.push({ code: "DUPLICATE_STRIKE", severity: "FAIL", detail: `strike ${s.strike} duplicated` });
    }
    seen.add(s.strike);
    const co = s.call.oi; const po = s.put.oi;
    if (co === 0 && po === 0) zeroOi += 1;
    if ((co != null && co < 0) || (po != null && po < 0)) negativeOi += 1;
    if (co == null || po == null) partial += 1;
  }
  if (zeroOi > 0) issues.push({ code: "ZERO_OI", severity: "WARN", detail: `${zeroOi} strikes with zero OI on both legs` });
  if (negativeOi > 0) issues.push({ code: "NEGATIVE_OI", severity: "FAIL", detail: `${negativeOi} strikes with negative OI` });
  if (partial > 0) issues.push({ code: "PARTIAL_SNAPSHOT", severity: "WARN", detail: `${partial} strikes missing OI` });

  if (snapshot.strikes.length < minStrikes) {
    issues.push({ code: "INSUFFICIENT_STRIKES", severity: "FAIL", detail: `only ${snapshot.strikes.length} strikes` });
  }

  const ts = Date.parse(snapshot.timestamp);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(ts)) {
    issues.push({ code: "TIMESTAMP_MISMATCH", severity: "FAIL", detail: "snapshot timestamp not parseable" });
  } else {
    if (ts > now + futureToleranceMs) {
      issues.push({ code: "FUTURE_TIMESTAMP", severity: "FAIL", detail: "snapshot timestamp is in the future" });
    }
    if (now - ts > staleMs) {
      issues.push({ code: "PROVIDER_STALE", severity: "WARN", detail: `snapshot older than ${Math.round(staleMs / 1000)}s` });
    }
  }

  if (snapshot.dataQuality === "FAILED") {
    issues.push({ code: "PROVIDER_STALE", severity: "FAIL", detail: "provider reported FAILED" });
  }

  return {
    ok: !issues.some((i) => i.severity === "FAIL"),
    issues,
    checkedAt: nowIso,
  };
}