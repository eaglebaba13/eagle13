// Phase 2H — Shared runtime-readiness query hook.
//
// Single source of truth for consuming the canonical runtime readiness
// report from any client component. All dashboard, admin and diagnostics
// surfaces read through this hook so React-Query dedupes fetches and
// serves a shared cache entry — no page rebuilds readiness from scratch.

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getRuntimeReadinessReport } from "./collect.functions";
import type { RuntimeReadinessReport } from "./runtime-readiness";

export const RUNTIME_READINESS_QUERY_KEY = ["runtime-readiness-report"] as const;

export function useRuntimeReadinessQuery(): UseQueryResult<
  RuntimeReadinessReport,
  Error
> {
  const fetchReport = useServerFn(getRuntimeReadinessReport);
  return useQuery<RuntimeReadinessReport, Error>({
    queryKey: RUNTIME_READINESS_QUERY_KEY,
    queryFn: () => fetchReport(),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}