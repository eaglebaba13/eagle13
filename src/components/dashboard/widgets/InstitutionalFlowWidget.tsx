// Phase 3D-1 — Compact dashboard widget for Institutional Flow.
// Consumer only — reads canonical option-chain derived report.

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Activity } from "lucide-react";
import { getInstitutionalFlow } from "@/lib/institutional-flow/institutional-flow.functions";

export function InstitutionalFlowWidget() {
  const fn = useServerFn(getInstitutionalFlow);
  const { data, isLoading, error } = useQuery({
    queryKey: ["institutional-flow-widget", "NIFTY"],
    queryFn: () => fn({ data: { underlying: "NIFTY" } }),
    staleTime: 60_000,
    refetchInterval: 90_000,
    retry: false,
  });

  const biasTone: Record<string, string> = {
    PUT_WRITERS_ACTIVE: "text-emerald-300",
    CALL_WRITERS_ACTIVE: "text-red-300",
    BALANCED: "text-muted-foreground",
    CONFLICT: "text-amber-300",
    UNAVAILABLE: "text-muted-foreground",
  };

  return (
    <div className="rounded-lg border border-border/60 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Activity size={13} aria-hidden /> Institutional Flow
        </div>
        <Link
          to="/institutional-flow"
          className="text-[11px] font-medium text-sky-300 hover:underline"
          aria-label="Open Institutional Flow dashboard"
        >
          Open →
        </Link>
      </div>

      {isLoading && <p className="mt-2 text-xs text-muted-foreground">Loading…</p>}
      {error && <p className="mt-2 text-xs text-red-300">Institutional Flow unavailable</p>}

      {data && (
        <div className="mt-2 space-y-1.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Bias</span>
            <span className={`font-medium ${biasTone[data.summary.bias] ?? "text-foreground"}`}>
              {data.summary.bias.replace(/_/g, " ")}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Build-up</span>
            <span className="text-foreground">{data.buildUp.overall.replace(/_/g, " ")}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Max Pain</span>
            <span className="text-foreground">
              {data.maxPain.currentMaxPain ?? "—"}
              {data.maxPain.distanceFromSpotPct != null && (
                <span className="ml-1 text-muted-foreground">
                  ({data.maxPain.distanceFromSpotPct.toFixed(2)}%)
                </span>
              )}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Source</span>
            <span className="text-foreground">{data.source}</span>
          </div>
          {data.diagnostics.warnings.length > 0 && (
            <p className="pt-1 text-[11px] text-amber-300">
              {data.diagnostics.warnings[0]}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default InstitutionalFlowWidget;