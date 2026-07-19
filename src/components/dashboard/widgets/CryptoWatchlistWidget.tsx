// Phase 3F.1 — Crypto watchlist widget.
// Placeholder default watchlist; user-configurable persistence deferred to
// v1.1 (see roadmap). Shares ["coindcx-markets"] query cache.

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { listCoindcxMarkets } from "@/lib/providers/coindcx/coindcx.functions";
import { buildWatchlist } from "@/lib/providers/coindcx/dashboard-selectors";

function fmt(n: number | null, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function CryptoWatchlistWidget() {
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
      aria-label="Crypto watchlist"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Star size={13} aria-hidden /> Watchlist
        </div>
        <span className="text-[10px] text-muted-foreground">Default</span>
      </div>

      {isLoading && <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">Loading…</p>}
      {error && <p className="mt-2 text-xs text-red-300" role="alert">Watchlist unavailable</p>}

      {data && (
        <ul className="mt-2 space-y-1">
          {rows.map((row) => (
            <li key={row.base}>
              <Link
                to="/crypto/$pair"
                params={{ pair: row.pair }}
                className="flex items-center justify-between rounded px-1 py-1 text-xs hover:bg-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label={`Open ${row.base} details`}
              >
                <span className="font-medium text-foreground">{row.base}</span>
                <span className="flex items-center gap-3 tabular-nums">
                  <span className="text-foreground">{fmt(row.last, 2)}</span>
                  <span
                    className={
                      row.change24hPct == null
                        ? "text-muted-foreground w-14 text-right"
                        : row.change24hPct >= 0
                          ? "w-14 text-right text-emerald-300"
                          : "w-14 text-right text-red-300"
                    }
                  >
                    {row.change24hPct != null ? `${row.change24hPct.toFixed(2)}%` : "—"}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default CryptoWatchlistWidget;
