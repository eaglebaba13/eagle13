// Phase 23 · Stage 2 — Provider health tracking.

import type { ProviderHealth, ProviderHealthStatus } from "./live-data-provider";

export type ProviderHealthSample = {
  readonly at: string;
  readonly ok: boolean;
  readonly latencyMs: number;
  readonly freshnessSeconds: number;
  readonly reason?: string;
};

export class ProviderHealthTracker {
  private samples: ProviderHealthSample[] = [];
  private readonly maxSamples: number;

  constructor(maxSamples = 100) {
    this.maxSamples = maxSamples;
  }

  record(sample: ProviderHealthSample): void {
    this.samples.push(sample);
    if (this.samples.length > this.maxSamples) this.samples.shift();
  }

  compute(
    supportedInstruments: readonly string[],
    supportedTimeframes: readonly string[],
    limitations: readonly string[] = [],
  ): ProviderHealth {
    const n = this.samples.length;
    if (n === 0) {
      return {
        status: "UNAVAILABLE",
        lastSuccessAt: null,
        lastFailureAt: null,
        latencyMs: 0,
        errorRate: 0,
        freshnessSeconds: Number.POSITIVE_INFINITY,
        supportedInstruments,
        supportedTimeframes,
        limitations,
      };
    }
    const errors = this.samples.filter((s) => !s.ok).length;
    const errorRate = errors / n;
    const lastSuccess = [...this.samples].reverse().find((s) => s.ok) ?? null;
    const lastFailure = [...this.samples].reverse().find((s) => !s.ok) ?? null;
    const latencyMs =
      this.samples.reduce((a, s) => a + s.latencyMs, 0) / n;
    const freshness =
      lastSuccess?.freshnessSeconds ?? Number.POSITIVE_INFINITY;
    const status = classify(errorRate, freshness, lastFailure);
    return {
      status,
      lastSuccessAt: lastSuccess?.at ?? null,
      lastFailureAt: lastFailure?.at ?? null,
      latencyMs,
      errorRate,
      freshnessSeconds: freshness,
      supportedInstruments,
      supportedTimeframes,
      limitations,
    };
  }

  snapshot(): readonly ProviderHealthSample[] {
    return [...this.samples];
  }
}

function classify(
  errorRate: number,
  freshness: number,
  lastFailure: ProviderHealthSample | null,
): ProviderHealthStatus {
  if (lastFailure?.reason === "RATE_LIMITED") return "RATE_LIMITED";
  if (lastFailure?.reason === "AUTH_REQUIRED") return "AUTH_REQUIRED";
  if (errorRate >= 1) return "UNAVAILABLE";
  if (errorRate >= 0.5) return "DEGRADED";
  if (freshness > 900) return "STALE";
  if (freshness > 30) return "DELAYED";
  return "HEALTHY";
}