// Phase 3F.1 — Compact crypto heatmap.
// Consumer only — shares ["coindcx-markets"] cache with other crypto widgets.

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Grid2X2 } from "lucide-react";
import { listCoindcxMarkets } from "@/lib/providers/coindcx/coindcx.functions";
import {
  buildWatchlist,
  type CryptoWidgetRow,
} from "@/lib/providers/coindcx/dashboard-selectors";

function cellTone(pct: number | null): string {
  if (pct == null) return "bg-muted/30 text-muted-foreground";
  if (pct > 0.5) return "bg-emerald-500/20 text-emerald-200";
  if (pct < -0.5) return "bg-red-500/20 text-red-200";
  return "bg-muted/40 text-foreground";
}

export function CryptoHeatmapWidget() {
  const fn = useServerFn(listCoindcxMarkets);
  const { data, isLoading, error } = useQuery({
    queryKey: ["coindcx-markets"],
    queryFn: () => fn(),
    staleTime: 10_000,
    refetchInterval: 15_000,
    retry: false,
  });

  const rows = buildWatchlist(data?.snapshots ?? []);

  return (
    <div
      className="rounded-lg border border-border/60 p-3"
      role="region"
      aria-label="Crypto 24 hour performance heatmap"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Grid2X2 size={13} aria-hidden /> Crypto Heatmap
        </div>
        <span className="text-[10px] text-muted-foreground">24h %</span>
      </div>

      {isLoading && (
        <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">
          Loading…
        </p>
      )}
      {error && (
        <p className="mt-2 text-xs text-red-300" role="alert">
          Heatmap unavailable
        </p>
      )}

      {data && (
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {rows.map((row) => (
            <HeatCell key={row.base} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}

function HeatCell({ row }: { row: CryptoWidgetRow }) {
  const tone = cellTone(row.change24hPct);
  const label = `${row.base} 24 hour change ${
    row.change24hPct != null ? `${row.change24hPct.toFixed(2)} percent` : "unavailable"
  }`;
  return (
    <Link
      to="/crypto/$pair"
      params={{ pair: row.pair }}
      aria-label={label}
      className={`block rounded-md p-2 transition ${tone} focus:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
    >
      <div className="flex items-center justify-between text-[11px] font-medium">
        <span>{row.base}</span>
        <span className="tabular-nums">
          {row.change24hPct != null ? `${row.change24hPct.toFixed(2)}%` : "—"}
        </span>
      </div>
      <div className="mt-1 h-1 w-full overflow-hidden rounded bg-black/20" aria-hidden>
        <div
          className={`h-full ${row.change24hPct != null && row.change24hPct >= 0 ? "bg-emerald-400/70" : "bg-red-400/70"}`}
          style={{ width: `${Math.min(100, Math.abs(row.change24hPct ?? 0) * 10)}%` }}
        />
      </div>
    </Link>
  );
}

export default CryptoHeatmapWidget;
