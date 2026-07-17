// Phase 28 — Provider health traffic-light.
//
// Pure, deterministic mapping from freshness / latency / coverage /
// diagnostics counts to a GREEN / YELLOW / RED chip. Reused by the
// dashboard summary and the launch-readiness console. No I/O.

export type TrafficLight = "GREEN" | "YELLOW" | "RED";

export interface TrafficLightInput {
  /** Freshness age in milliseconds. `null` when unknown. */
  readonly freshnessMs: number | null;
  /** Provider latency in milliseconds. `null` when unknown. */
  readonly latencyMs: number | null;
  /** Constituent coverage 0..1. `null` when not applicable. */
  readonly coverage: number | null;
  /** Count of provider-reported failures in the window. */
  readonly failures?: number;
  /** Explicit provider status override (e.g. OFFLINE, RATE_LIMITED). */
  readonly providerStatus?: "LIVE" | "DELAYED" | "STALE" | "OFFLINE" | "RATE_LIMITED" | "FAILED" | "UNKNOWN";
}

export interface TrafficLightThresholds {
  readonly freshGreenMs: number;
  readonly freshYellowMs: number;
  readonly latencyGreenMs: number;
  readonly latencyYellowMs: number;
  readonly coverageGreen: number;
  readonly coverageYellow: number;
  readonly failureYellow: number;
  readonly failureRed: number;
}

export const DEFAULT_THRESHOLDS: TrafficLightThresholds = {
  freshGreenMs: 60_000,
  freshYellowMs: 5 * 60_000,
  latencyGreenMs: 1_500,
  latencyYellowMs: 5_000,
  coverageGreen: 0.9,
  coverageYellow: 0.6,
  failureYellow: 1,
  failureRed: 3,
};

function worse(a: TrafficLight, b: TrafficLight): TrafficLight {
  const rank: Record<TrafficLight, number> = { GREEN: 0, YELLOW: 1, RED: 2 };
  return rank[a] >= rank[b] ? a : b;
}

export function evaluateTrafficLight(
  input: TrafficLightInput,
  t: TrafficLightThresholds = DEFAULT_THRESHOLDS,
): TrafficLight {
  let level: TrafficLight = "GREEN";

  const status = input.providerStatus ?? "UNKNOWN";
  if (status === "OFFLINE" || status === "FAILED") return "RED";
  if (status === "RATE_LIMITED" || status === "STALE") level = worse(level, "YELLOW");
  if (status === "UNKNOWN" || status === "DELAYED") level = worse(level, "YELLOW");

  if (input.freshnessMs == null) {
    level = worse(level, "YELLOW");
  } else if (input.freshnessMs > t.freshYellowMs) {
    level = worse(level, "RED");
  } else if (input.freshnessMs > t.freshGreenMs) {
    level = worse(level, "YELLOW");
  }

  if (input.latencyMs != null) {
    if (input.latencyMs > t.latencyYellowMs) level = worse(level, "RED");
    else if (input.latencyMs > t.latencyGreenMs) level = worse(level, "YELLOW");
  }

  if (input.coverage != null) {
    if (input.coverage < t.coverageYellow) level = worse(level, "RED");
    else if (input.coverage < t.coverageGreen) level = worse(level, "YELLOW");
  }

  const failures = input.failures ?? 0;
  if (failures >= t.failureRed) level = worse(level, "RED");
  else if (failures >= t.failureYellow) level = worse(level, "YELLOW");

  return level;
}

export function trafficLightLabel(l: TrafficLight): string {
  return l === "GREEN" ? "Healthy" : l === "YELLOW" ? "Degraded" : "Unhealthy";
}