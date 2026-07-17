// Phase 28 — Compact GTI summary widget for the main dashboard.
//
// Uses a single shared query so it never issues duplicate provider
// requests when the expanded GTI section also renders.

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getGtiSummary, type GtiSummary } from "@/lib/gti-summary/gti-summary.functions";
import type { TrafficLight } from "@/lib/provider-health/traffic-light";
import { trafficLightLabel } from "@/lib/provider-health/traffic-light";

export const GTI_SUMMARY_QUERY_KEY = ["gti-summary"] as const;

function Chip({ light, label }: { light: TrafficLight; label: string }) {
  const bg = light === "GREEN" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
    : light === "YELLOW" ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
    : "bg-red-500/15 text-red-300 border-red-500/30";
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs ${bg}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {label}
    </span>
  );
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">
        {value}
        {sub ? <span className="ml-1 text-xs text-muted-foreground">{sub}</span> : null}
      </span>
    </div>
  );
}

export function GtiSummaryCard() {
  const fetchSummary = useServerFn(getGtiSummary);
  const { data, isLoading, error, refetch, isFetching } = useQuery<GtiSummary>({
    queryKey: [...GTI_SUMMARY_QUERY_KEY],
    queryFn: () => fetchSummary(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  return (
    <section
      aria-label="GTI Summary"
      className="rounded-xl border border-border bg-card/60 p-4"
    >
      <header className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">GTI Summary</h2>
          <p className="text-xs text-muted-foreground">Research-only market snapshot</p>
        </div>
        <div className="flex items-center gap-2">
          {data && <Chip light={data.health.overall} label={trafficLightLabel(data.health.overall)} />}
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
            disabled={isFetching}
          >
            {isFetching ? "…" : "Refresh"}
          </button>
        </div>
      </header>

      {isLoading && <div className="py-6 text-center text-xs text-muted-foreground">Loading…</div>}
      {error && (
        <div role="alert" className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
          {(error as Error).message}
        </div>
      )}

      {data && (
        <div className="grid gap-2">
          <Row
            label="NIFTY"
            value={data.nifty ? data.nifty.price.toFixed(2) : "—"}
            sub={data.nifty ? `${data.nifty.changePercent.toFixed(2)}%` : undefined}
          />
          <Row
            label="BANKNIFTY"
            value={data.banknifty ? data.banknifty.price.toFixed(2) : "—"}
            sub={data.banknifty ? `${data.banknifty.changePercent.toFixed(2)}%` : undefined}
          />
          <Row
            label="India VIX"
            value={data.vix.value != null ? data.vix.value.toFixed(2) : "—"}
            sub={data.vix.regime}
          />
          <Row
            label="Combined PCR"
            value={data.combinedPcr.score != null ? data.combinedPcr.score.toFixed(1) : "—"}
            sub={data.combinedPcr.state}
          />
          <Row label="Breadth" value={data.breadthState} />
          <Row
            label="GTI State"
            value={data.gti.state.replace(/_/g, " ")}
            sub={`${Math.round(data.gti.confidence)}% conf`}
          />
          <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
            <Chip light={data.health.quotes} label={`Quotes ${trafficLightLabel(data.health.quotes)}`} />
            <Chip light={data.health.options} label={`Options ${trafficLightLabel(data.health.options)}`} />
            <Chip light={data.health.breadth} label={`Breadth ${trafficLightLabel(data.health.breadth)}`} />
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">{data.disclaimer}</p>
        </div>
      )}
    </section>
  );
}