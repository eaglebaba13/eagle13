import type { ReadinessResult } from "./production-readiness-types";

export type ProviderStatus =
  | "HEALTHY"
  | "DEGRADED"
  | "RATE_LIMITED"
  | "AUTH_FAILURE"
  | "SCHEMA_FAILURE"
  | "STALE"
  | "UNAVAILABLE";

export interface ProviderProbe {
  id: string;
  label: string;
  status: ProviderStatus;
  latencyMs?: number | null;
  lastSuccessAt?: string | null;
  errorRate?: number | null; // 0..1
  fallbackAllowed: boolean;
  fallbackActive: boolean;
  required: boolean;
  notes?: string;
}

export interface ProviderReadinessInput {
  probes: readonly ProviderProbe[];
}

const OK_STATUSES: ReadonlySet<ProviderStatus> = new Set(["HEALTHY"]);
const WARN_STATUSES: ReadonlySet<ProviderStatus> = new Set(["DEGRADED", "RATE_LIMITED", "STALE"]);

export function auditProviders(input: ProviderReadinessInput): ReadinessResult[] {
  return input.probes.map((p) => {
    const ok = OK_STATUSES.has(p.status);
    const warn = WARN_STATUSES.has(p.status);
    const fail = !ok && !warn;
    return {
      id: `provider.${p.id}`,
      category: "PROVIDERS",
      title: `Provider: ${p.label}`,
      status: ok ? "PASS" : warn ? "WARNING" : "FAIL",
      severity: ok ? "info" : fail && p.required ? "blocker" : warn ? "warning" : "critical",
      hardBlocker: fail && p.required && !p.fallbackAllowed,
      detail:
        [
          `status=${p.status}`,
          p.fallbackActive ? "fallback ACTIVE" : "",
          p.errorRate != null ? `err=${(p.errorRate * 100).toFixed(1)}%` : "",
          p.latencyMs != null ? `p50=${p.latencyMs}ms` : "",
          p.notes ?? "",
        ]
          .filter(Boolean)
          .join(" · ") || undefined,
      evidence: [
        { key: "status", value: p.status },
        { key: "fallbackActive", value: p.fallbackActive },
        { key: "required", value: p.required },
      ],
    } as ReadinessResult;
  });
}
