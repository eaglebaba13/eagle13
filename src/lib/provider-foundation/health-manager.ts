import type { ProviderStatus } from "./types";

export interface HealthSample {
  readonly at: string;
  readonly ok: boolean;
  readonly latencyMs: number;
  readonly reason?: string;
}

export interface HealthSummary {
  readonly providerId: string;
  readonly status: ProviderStatus;
  readonly calls: number;
  readonly errors: number;
  readonly errorRate: number;
  readonly avgLatencyMs: number;
  readonly lastSuccessAt: string | null;
  readonly lastFailureAt: string | null;
  readonly transitions: readonly HealthTransition[];
}

export interface HealthTransition {
  readonly at: string;
  readonly from: ProviderStatus;
  readonly to: ProviderStatus;
  readonly reason: string;
}

export class ProviderHealthManager {
  private readonly samples: HealthSample[] = [];
  private readonly transitions: HealthTransition[] = [];
  // Untried providers are assumed usable so the manager attempts them at
  // least once. Real status is recorded after the first call and drives
  // subsequent failover decisions.
  private lastStatus: ProviderStatus = "LIVE";
  private readonly maxSamples: number;

  constructor(
    readonly providerId: string,
    maxSamples = 200,
  ) {
    this.maxSamples = maxSamples;
  }

  record(sample: HealthSample, newStatus: ProviderStatus): void {
    this.samples.push(sample);
    if (this.samples.length > this.maxSamples) this.samples.shift();
    if (newStatus !== this.lastStatus) {
      this.transitions.push({
        at: sample.at,
        from: this.lastStatus,
        to: newStatus,
        reason: sample.reason ?? (sample.ok ? "recovered" : "failure"),
      });
      if (this.transitions.length > this.maxSamples) this.transitions.shift();
      this.lastStatus = newStatus;
    }
  }

  currentStatus(): ProviderStatus {
    return this.lastStatus;
  }

  summary(): HealthSummary {
    const calls = this.samples.length;
    const errs = this.samples.filter((s) => !s.ok).length;
    const avg =
      calls === 0 ? 0 : this.samples.reduce((a, s) => a + s.latencyMs, 0) / calls;
    const lastSuccess = [...this.samples].reverse().find((s) => s.ok) ?? null;
    const lastFailure = [...this.samples].reverse().find((s) => !s.ok) ?? null;
    return {
      providerId: this.providerId,
      status: this.lastStatus,
      calls,
      errors: errs,
      errorRate: calls === 0 ? 0 : errs / calls,
      avgLatencyMs: avg,
      lastSuccessAt: lastSuccess?.at ?? null,
      lastFailureAt: lastFailure?.at ?? null,
      transitions: [...this.transitions],
    };
  }
}
