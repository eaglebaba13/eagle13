// Phase 3F.1 — Crypto dashboard summary widget.
// Consumer only. Shares ["coindcx-markets"] query cache.

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Activity } from "lucide-react";
import { listCoindcxMarkets } from "@/lib/providers/coindcx/coindcx.functions";
import {
  buildWatchlist,
  summarizeCrypto,
} from "@/lib/providers/coindcx/dashboard-selectors";

const STATUS_TONE: Record<string, string> = {
  LIVE: "text-emerald-300",
  DELAYED: "text-amber-300",
  OFFLINE: "text-red-300",
  UNAVAILABLE: "text-muted-foreground",
};

export function CryptoSummaryWidget() {
  const fn = useServerFn(listCoindcxMarkets);
  const { data, isLoading, error } = useQuery({
    queryKey: ["coindcx-markets"],
    queryFn: () => fn(),
    staleTime: 10_000,
    refetchInterval: 15_000,
    retry: false,
  });

  const rows = buildWatchlist(data?.snapshots ?? []);
  const summary = summarizeCrypto(rows);

  return (
    <div
      className="rounded-lg border border-border/60 p-3"
      role="region"
      aria-label="Crypto market summary"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Activity size={13} aria-hidden /> Crypto Summary
        </div>
        <Link
          to="/crypto"
          className="text-[11px] font-medium text-sky-300 hover:underline"
        >
          Details →
        </Link>
      </div>

      {isLoading && <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">Loading…</p>}
      {error && <p className="mt-2 text-xs text-red-300" role="alert">Summary unavailable</p>}

      {data && (
        <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <Stat label="Tracked" value={String(summary.total)} />
          <Stat
            label="Provider"
            value={summary.worstStatus}
            className={STATUS_TONE[summary.worstStatus] ?? ""}
          />
          <Stat label="Gainers" value={String(summary.gainers)} className="text-emerald-300" />
          <Stat label="Losers" value={String(summary.losers)} className="text-red-300" />
          <Stat
            label="Best"
            value={
              summary.bestPerformer
                ? `${summary.bestPerformer.base} ${summary.bestPerformer.change24hPct?.toFixed(2)}%`
                : "—"
            }
          />
          <Stat
            label="Worst"
            value={
              summary.worstPerformer
                ? `${summary.worstPerformer.base} ${summary.worstPerformer.change24hPct?.toFixed(2)}%`
                : "—"
            }
          />
          <Stat
            label="Avg 24h"
            value={summary.avgChangePct != null ? `${summary.avgChangePct.toFixed(2)}%` : "—"}
            className={
              summary.avgChangePct == null
                ? ""
                : summary.avgChangePct >= 0
                  ? "text-emerald-300"
                  : "text-red-300"
            }
          />
          <Stat label="Source" value="CoinDCX" />
        </dl>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="rounded border border-border/40 bg-card/30 px-2 py-1.5">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 font-medium tabular-nums text-foreground ${className}`}>{value}</dd>
    </div>
  );
}

export default CryptoSummaryWidget;
