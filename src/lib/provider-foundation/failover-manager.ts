import type { ProviderAdapter, ProviderRole, ProviderStatus } from "./types";

export interface FailoverDecision {
  readonly chosen: ProviderAdapter | null;
  readonly role: ProviderRole | "NONE";
  readonly reason: string;
  readonly candidates: readonly { id: string; role: ProviderRole; status: ProviderStatus }[];
}

export interface ProviderView {
  readonly adapter: ProviderAdapter;
  readonly status: ProviderStatus;
}

const HEALTHY: ReadonlySet<ProviderStatus> = new Set(["LIVE", "DELAYED"]);

export class FailoverManager {
  choose(primary: ProviderView | null, secondary: ProviderView | null): FailoverDecision {
    const candidates: FailoverDecision["candidates"] = [
      primary ? { id: primary.adapter.id, role: "PRIMARY" as ProviderRole, status: primary.status } : null,
      secondary ? { id: secondary.adapter.id, role: "SECONDARY" as ProviderRole, status: secondary.status } : null,
    ].filter(Boolean) as FailoverDecision["candidates"];

    if (primary && HEALTHY.has(primary.status)) {
      return {
        chosen: primary.adapter,
        role: "PRIMARY",
        reason: `primary healthy (${primary.status})`,
        candidates,
      };
    }
    if (secondary && HEALTHY.has(secondary.status)) {
      return {
        chosen: secondary.adapter,
        role: "SECONDARY",
        reason: primary
          ? `primary ${primary.status} → failover secondary`
          : "no primary configured",
        candidates,
      };
    }
    // Both unhealthy: prefer STALE (still has data) over hard failures.
    if (primary?.status === "STALE") {
      return { chosen: primary.adapter, role: "PRIMARY", reason: "primary stale (best-available)", candidates };
    }
    if (secondary?.status === "STALE") {
      return { chosen: secondary.adapter, role: "SECONDARY", reason: "secondary stale (best-available)", candidates };
    }
    return {
      chosen: null,
      role: "NONE",
      reason: "all providers offline/failed/rate-limited",
      candidates,
    };
  }
}
