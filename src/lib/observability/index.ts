// Phase 28 — Lightweight in-memory observability.
//
// Tracks provider latency, failures, cache-hit ratio, hydration errors
// and React errors so the launch-readiness console can surface them.
// Fixed-size ring buffer; no external SDK; no network calls.

export type ObservabilityEventType =
  | "provider.latency"
  | "provider.failure"
  | "cache.hit"
  | "cache.miss"
  | "hydration.error"
  | "react.error"
  | "slow.query"
  | "api.retry";

export interface ObservabilityEvent {
  readonly type: ObservabilityEventType;
  readonly at: number;
  readonly detail?: string;
  readonly value?: number;
  readonly tag?: string;
}

export interface ObservabilitySnapshot {
  readonly total: number;
  readonly providerFailures: number;
  readonly hydrationErrors: number;
  readonly reactErrors: number;
  readonly cacheHitRatio: number | null;
  readonly avgLatencyMs: number | null;
  readonly recent: readonly ObservabilityEvent[];
}

const RING_LIMIT = 200;
const buffer: ObservabilityEvent[] = [];

export function recordEvent(ev: Omit<ObservabilityEvent, "at"> & { at?: number }): void {
  buffer.push({ ...ev, at: ev.at ?? Date.now() });
  if (buffer.length > RING_LIMIT) buffer.splice(0, buffer.length - RING_LIMIT);
}

export function snapshotObservability(): ObservabilitySnapshot {
  const total = buffer.length;
  const providerFailures = buffer.filter((e) => e.type === "provider.failure").length;
  const hydrationErrors = buffer.filter((e) => e.type === "hydration.error").length;
  const reactErrors = buffer.filter((e) => e.type === "react.error").length;
  const hits = buffer.filter((e) => e.type === "cache.hit").length;
  const misses = buffer.filter((e) => e.type === "cache.miss").length;
  const cacheHitRatio = hits + misses === 0 ? null : hits / (hits + misses);
  const latencies = buffer.filter((e) => e.type === "provider.latency" && typeof e.value === "number");
  const avgLatencyMs =
    latencies.length === 0
      ? null
      : latencies.reduce((s, e) => s + (e.value ?? 0), 0) / latencies.length;
  const recent = buffer.slice(-30);
  return { total, providerFailures, hydrationErrors, reactErrors, cacheHitRatio, avgLatencyMs, recent };
}

export function _resetObservability(): void {
  buffer.length = 0;
}