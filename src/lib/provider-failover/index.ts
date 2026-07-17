// Phase 29 · Stage 1 — Provider priority chain with degraded-state
// reporting. Pure, deterministic. NEVER fabricates data — if every
// provider in the chain fails, callers receive an explicit DEGRADED
// result with `data: null` and a warnings list.
//
// Read-only. No broker/execution paths.

export type ProviderId =
  | "UPSTOX"
  | "INDSTOCKS"
  | "SHOONYA"
  | "ANGEL"
  | "MOCK";

export type ProviderChainState = "PRIMARY_OK" | "FAILOVER_OK" | "DEGRADED";

export interface ProviderAttempt {
  readonly provider: ProviderId;
  readonly ok: boolean;
  readonly latencyMs: number;
  readonly safeError: string | null;
}

export interface ProviderChainResult<T> {
  readonly state: ProviderChainState;
  readonly data: T | null;
  readonly provider: ProviderId | null;
  readonly attempts: readonly ProviderAttempt[];
  readonly warnings: readonly string[];
  readonly formulaVersion: string;
}

export const PROVIDER_CHAIN_VERSION = "provider-failover@1.0.0";

export const DEFAULT_PROVIDER_PRIORITY: readonly ProviderId[] = [
  "UPSTOX",
  "INDSTOCKS",
  "SHOONYA",
  "ANGEL",
];

export interface ProviderFetcher<T> {
  readonly id: ProviderId;
  fetch(): Promise<{ ok: boolean; data: T | null; latencyMs: number; safeError: string | null }>;
}

export async function runProviderChain<T>(
  fetchers: readonly ProviderFetcher<T>[],
): Promise<ProviderChainResult<T>> {
  const attempts: ProviderAttempt[] = [];
  const warnings: string[] = [];
  for (let i = 0; i < fetchers.length; i++) {
    const f = fetchers[i];
    try {
      const r = await f.fetch();
      attempts.push({
        provider: f.id,
        ok: r.ok,
        latencyMs: r.latencyMs,
        safeError: r.safeError,
      });
      if (r.ok && r.data != null) {
        return {
          state: i === 0 ? "PRIMARY_OK" : "FAILOVER_OK",
          data: r.data,
          provider: f.id,
          attempts,
          warnings,
          formulaVersion: PROVIDER_CHAIN_VERSION,
        };
      }
      warnings.push(`${f.id}:${r.safeError ?? "no_data"}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      attempts.push({ provider: f.id, ok: false, latencyMs: 0, safeError: msg });
      warnings.push(`${f.id}:${msg}`);
    }
  }
  return {
    state: "DEGRADED",
    data: null,
    provider: null,
    attempts,
    warnings,
    formulaVersion: PROVIDER_CHAIN_VERSION,
  };
}

export function summariseChain(res: ProviderChainResult<unknown>): {
  readonly state: ProviderChainState;
  readonly primary: ProviderId | null;
  readonly used: ProviderId | null;
  readonly failedProviders: readonly ProviderId[];
} {
  const primary = res.attempts[0]?.provider ?? null;
  const failed = res.attempts.filter((a) => !a.ok).map((a) => a.provider);
  return {
    state: res.state,
    primary,
    used: res.provider,
    failedProviders: failed,
  };
}