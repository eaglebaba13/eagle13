// Phase 31 · Health endpoint composer.
//
// Pure aggregator that turns subsystem statuses into a single JSON-shaped
// health payload for `/api/public/health` style consumers. No I/O here.

export type HealthStatus = "healthy" | "degraded" | "unhealthy" | "unknown";

export type SubsystemHealth = {
  name: "application" | "database" | "provider" | "queue" | "cache";
  status: HealthStatus;
  latencyMs?: number;
  detail?: string;
};

export type BuildInfo = {
  version: string;
  gitCommit: string;
  deployedAt: string; // ISO 8601
  environment: "development" | "staging" | "production";
};

export type HealthPayload = {
  status: HealthStatus;
  build: BuildInfo;
  subsystems: SubsystemHealth[];
  checkedAt: string;
};

const RANK: Record<HealthStatus, number> = {
  healthy: 0,
  unknown: 1,
  degraded: 2,
  unhealthy: 3,
};

export function rollupStatus(subsystems: SubsystemHealth[]): HealthStatus {
  if (subsystems.length === 0) return "unknown";
  let worst: HealthStatus = "healthy";
  for (const s of subsystems) if (RANK[s.status] > RANK[worst]) worst = s.status;
  return worst;
}

export function buildHealthPayload(
  subsystems: SubsystemHealth[],
  build: BuildInfo,
  now: Date = new Date(),
): HealthPayload {
  return {
    status: rollupStatus(subsystems),
    build,
    subsystems,
    checkedAt: now.toISOString(),
  };
}

export function httpStatusFor(status: HealthStatus): 200 | 503 {
  return status === "unhealthy" ? 503 : 200;
}