// Phase 31 · Monitoring aggregator.
//
// Deterministic summaries over a ring buffer of samples. Callers push
// samples from server functions / route handlers; consumers read summaries.

export type MonitoringSampleKind =
  | "api-latency"
  | "server-error"
  | "unhandled-exception"
  | "provider-failure"
  | "cache-hit"
  | "cache-miss"
  | "memory"
  | "cpu"
  | "slow-request";

export type MonitoringSample = {
  kind: MonitoringSampleKind;
  value: number; // ms for latency/mem/cpu, 1 for events
  at: number; // epoch ms
  route?: string;
  detail?: string;
};

export type MonitoringSummary = {
  total: number;
  windowMs: number;
  latencyP50Ms: number;
  latencyP95Ms: number;
  errorRate: number;
  unhandledExceptions: number;
  providerFailures: number;
  cacheHitRatio: number;
  slowRequests: number;
  memoryPeakMb: number | null;
  cpuPeakPercent: number | null;
};

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[idx];
}

export function summariseMonitoring(
  samples: MonitoringSample[],
  windowMs = 5 * 60_000,
  now: number = Date.now(),
): MonitoringSummary {
  const cutoff = now - windowMs;
  const within = samples.filter((s) => s.at >= cutoff);
  const lat = within
    .filter((s) => s.kind === "api-latency")
    .map((s) => s.value)
    .sort((a, b) => a - b);
  const errors = within.filter((s) => s.kind === "server-error").length;
  const unhandled = within.filter((s) => s.kind === "unhandled-exception").length;
  const providerFail = within.filter((s) => s.kind === "provider-failure").length;
  const hits = within.filter((s) => s.kind === "cache-hit").length;
  const misses = within.filter((s) => s.kind === "cache-miss").length;
  const slow = within.filter((s) => s.kind === "slow-request").length;
  const memPeak = within
    .filter((s) => s.kind === "memory")
    .reduce<number | null>((m, s) => (m === null || s.value > m ? s.value : m), null);
  const cpuPeak = within
    .filter((s) => s.kind === "cpu")
    .reduce<number | null>((m, s) => (m === null || s.value > m ? s.value : m), null);
  const requests = lat.length;
  const cacheTotal = hits + misses;
  return {
    total: within.length,
    windowMs,
    latencyP50Ms: percentile(lat, 50),
    latencyP95Ms: percentile(lat, 95),
    errorRate: requests > 0 ? errors / requests : 0,
    unhandledExceptions: unhandled,
    providerFailures: providerFail,
    cacheHitRatio: cacheTotal > 0 ? hits / cacheTotal : 0,
    slowRequests: slow,
    memoryPeakMb: memPeak,
    cpuPeakPercent: cpuPeak,
  };
}

/** In-memory ring buffer for server-side use. Not persisted. */
export class MonitoringBuffer {
  private buf: MonitoringSample[] = [];
  constructor(private readonly capacity: number = 2000) {}
  push(sample: MonitoringSample): void {
    this.buf.push(sample);
    if (this.buf.length > this.capacity) this.buf.splice(0, this.buf.length - this.capacity);
  }
  snapshot(): MonitoringSample[] {
    return this.buf.slice();
  }
  clear(): void {
    this.buf = [];
  }
}