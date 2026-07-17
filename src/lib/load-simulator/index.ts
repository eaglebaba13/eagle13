// Phase 29 · Stage 1 — Deterministic load-test simulator.

export interface LoadInputs {
  readonly users: number;
  readonly requestsPerUserPerMinute: number;
  readonly cacheHitRatio: number;
  readonly providerP95LatencyMs: number;
  readonly providerCapacityRps: number;
}

export type LoadVerdict = "SAFE" | "WATCH" | "OVERLOAD";

export interface LoadReport {
  readonly users: number;
  readonly requestsPerSecond: number;
  readonly providerRps: number;
  readonly headroomRatio: number;
  readonly projectedP95Ms: number;
  readonly verdict: LoadVerdict;
  readonly formulaVersion: string;
}

export const LOAD_SIM_VERSION = "load-sim@1.0.0";

export function simulateLoad(inp: LoadInputs): LoadReport {
  const rps = (inp.users * inp.requestsPerUserPerMinute) / 60;
  const providerRps = rps * (1 - Math.max(0, Math.min(1, inp.cacheHitRatio)));
  const headroomRatio = providerRps === 0 ? Number.POSITIVE_INFINITY : inp.providerCapacityRps / providerRps;
  const utilisation = providerRps / Math.max(1, inp.providerCapacityRps);
  const projectedP95Ms = utilisation < 1
    ? inp.providerP95LatencyMs / (1 - utilisation)
    : inp.providerP95LatencyMs * 10;
  const verdict: LoadVerdict =
    utilisation >= 0.9 ? "OVERLOAD" : utilisation >= 0.7 ? "WATCH" : "SAFE";
  return {
    users: inp.users,
    requestsPerSecond: rps,
    providerRps, headroomRatio, projectedP95Ms, verdict,
    formulaVersion: LOAD_SIM_VERSION,
  };
}

export const STANDARD_LOAD_TIERS: readonly number[] = [50, 100, 250, 500, 1000];

export function simulateStandardTiers(base: Omit<LoadInputs, "users">): readonly LoadReport[] {
  return STANDARD_LOAD_TIERS.map((users) => simulateLoad({ ...base, users }));
}