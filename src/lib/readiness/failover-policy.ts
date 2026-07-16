/**
 * Phase 25 — Provider failover policy.
 * Declarative rules — never fabricate data, never allow silent fallback
 * that changes methodology without disclosure.
 */
import type { ReadinessResult } from "./production-readiness-types";

export interface FailoverRule {
  dependency: string;
  primary: string;
  secondary: string | null;
  fallbackAllowed: boolean;
  maxTimestampDivergenceMs: number;
  actionableSignalAllowedOnFallback: boolean;
  requiresDisclosure: boolean;
}

export const FAILOVER_POLICY: readonly FailoverRule[] = [
  {
    dependency: "quote.nifty",
    primary: "primary_market_data",
    secondary: "yahoo",
    fallbackAllowed: true,
    maxTimestampDivergenceMs: 60_000,
    actionableSignalAllowedOnFallback: false,
    requiresDisclosure: true,
  },
  {
    dependency: "quote.banknifty",
    primary: "primary_market_data",
    secondary: "yahoo",
    fallbackAllowed: true,
    maxTimestampDivergenceMs: 60_000,
    actionableSignalAllowedOnFallback: false,
    requiresDisclosure: true,
  },
  {
    dependency: "gold_silver",
    primary: "commodity_primary",
    secondary: "commodity_secondary",
    fallbackAllowed: true,
    maxTimestampDivergenceMs: 5 * 60_000,
    actionableSignalAllowedOnFallback: false,
    requiresDisclosure: true,
  },
  {
    dependency: "astro.reference",
    primary: "swiss_ephemeris",
    secondary: null,
    fallbackAllowed: false,
    maxTimestampDivergenceMs: 0,
    actionableSignalAllowedOnFallback: false,
    requiresDisclosure: false,
  },
  {
    dependency: "options.chain",
    primary: "primary_options",
    secondary: null,
    fallbackAllowed: false,
    maxTimestampDivergenceMs: 0,
    actionableSignalAllowedOnFallback: false,
    requiresDisclosure: false,
  },
];

export interface FailoverAuditInput {
  activeFallbacks: readonly {
    dependency: string;
    disclosed: boolean;
    actionableAllowed: boolean;
  }[];
}

export function auditFailover(input: FailoverAuditInput): ReadinessResult[] {
  const out: ReadinessResult[] = [];
  for (const active of input.activeFallbacks) {
    const rule = FAILOVER_POLICY.find((r) => r.dependency === active.dependency);
    if (!rule) {
      out.push({
        id: `failover.${active.dependency}.unknown`,
        category: "PROVIDERS",
        title: `Failover: ${active.dependency}`,
        status: "WARNING",
        severity: "warning",
        detail: "Unknown fallback dependency — add to FAILOVER_POLICY.",
      });
      continue;
    }
    if (!rule.fallbackAllowed) {
      out.push({
        id: `failover.${active.dependency}`,
        category: "PROVIDERS",
        title: `Failover: ${active.dependency}`,
        status: "FAIL",
        severity: "blocker",
        hardBlocker: true,
        detail: "Fallback is active but this dependency forbids fallback.",
      });
      continue;
    }
    const violations: string[] = [];
    if (rule.requiresDisclosure && !active.disclosed) violations.push("undisclosed");
    if (!rule.actionableSignalAllowedOnFallback && active.actionableAllowed)
      violations.push("actionable-signal-allowed");
    out.push({
      id: `failover.${active.dependency}`,
      category: "PROVIDERS",
      title: `Failover: ${active.dependency}`,
      status: violations.length ? "FAIL" : "PASS",
      severity: violations.length ? "critical" : "info",
      hardBlocker: violations.length > 0,
      detail: violations.length ? `Violations: ${violations.join(", ")}` : undefined,
    });
  }
  return out;
}
