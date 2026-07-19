// Phase 3F.1 — Dashboard crypto market widget.
// Consumer only. Shares the `["coindcx-markets"]` query cache with all other
// crypto widgets — no duplicate polling.

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Bitcoin } from "lucide-react";
import { listCoindcxMarkets } from "@/lib/providers/coindcx/coindcx.functions";
import {
  buildWatchlist,
  findTokenizedMetals,
  type CryptoWidgetRow,
} from "@/lib/providers/coindcx/dashboard-selectors";

const COINDCX_MARKETS_QUERY_KEY = ["coindcx-markets"] as const;

function fmtNum(n: number | null, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function statusDot(status: CryptoWidgetRow["status"]): { color: string; label: string } {
  switch (status) {
    case "LIVE":
      return { color: "bg-emerald-400", label: "Live" };
    case "DELAYED":
      return { color: "bg-amber-400", label: "Delayed" };
    case "OFFLINE":
      return { color: "bg-red-400", label: "Offline" };
    default:
      return { color: "bg-muted-foreground/40", label: "Unavailable" };
  }
}

export function CryptoMarketWidget() {
  const fn = useServerFn(listCoindcxMarkets);
  const { data, isLoading, error } = useQuery({
    queryKey: COINDCX_MARKETS_QUERY_KEY,
    queryFn: () => fn(),
    staleTime: 10_000,
    refetchInterval: 15_000,
    retry: false,
  });

  const snapshots = data?.snapshots ?? [];
  const watchlist = buildWatchlist(snapshots);
  const { gold, silver } = findTokenizedMetals(snapshots);

  return (
    <div
      className="rounded-lg border border-border/60 p-3"
      role="region"
      aria-label="Crypto and tokenized metals market data"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Bitcoin size={13} aria-hidden /> Crypto Markets
        </div>
        <Link
          to="/crypto"
          className="text-[11px] font-medium text-sky-300 hover:underline"
          aria-label="Open full crypto market page"
        >
          Open →
        </Link>
      </div>

      {isLoading && (
        <p
          className="mt-2 text-xs text-muted-foreground"
          aria-live="polite"
          role="status"
        >
          Loading crypto markets…
        </p>
      )}
      {error && (
        <p
          className="mt-2 text-xs text-red-300"
          role="alert"
        >
          Crypto markets unavailable
        </p>
      )}

      {data && (
        <ul className="mt-2 space-y-1" aria-label="Crypto watchlist">
          {watchlist.map((row) => (
            <CryptoRow key={row.base} row={row} />
          ))}
          <li className="pt-2 text-[10px] uppercase tracking-wide text-muted-foreground">
            Tokenized Metals
          </li>
          <MetalRow label="Tokenized Gold" row={gold} />
          <MetalRow label="Tokenized Silver" row={silver} />
        </ul>
      )}
      <p className="mt-2 text-[10px] text-muted-foreground">
        Source: CoinDCX public API · Market data only · No trading
      </p>
    </div>
  );
}

function CryptoRow({ row }: { row: CryptoWidgetRow }) {
  const dot = statusDot(row.status);
  const pctClass =
    row.change24hPct == null
      ? "text-muted-foreground"
      : row.change24hPct >= 0
        ? "text-emerald-300"
        : "text-red-300";
  const label = `${row.base} ${row.status.toLowerCase()}${
    row.change24hPct != null ? `, 24 hour change ${row.change24hPct.toFixed(2)} percent` : ""
  }`;
  return (
    <li>
      <Link
        to="/crypto/$pair"
        params={{ pair: row.pair }}
        className="flex items-center justify-between rounded px-1 py-1 text-xs hover:bg-accent/40 focus:bg-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-label={label}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            className={`inline-block h-2 w-2 rounded-full ${dot.color}`}
            aria-hidden
            title={dot.label}
          />
          <span className="font-medium text-foreground">{row.base}</span>
          <span className="truncate text-muted-foreground">/{row.quote}</span>
        </span>
        <span className="flex items-center gap-2 tabular-nums">
          <span className="text-foreground">{fmtNum(row.last, 2)}</span>
          <span className={`w-14 text-right ${pctClass}`}>
            {row.change24hPct != null ? `${row.change24hPct.toFixed(2)}%` : "—"}
          </span>
        </span>
      </Link>
    </li>
  );
}

function MetalRow({ label, row }: { label: string; row: CryptoWidgetRow | null }) {
  if (!row) {
    return (
      <li className="flex items-center justify-between rounded px-1 py-1 text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="text-[10px] uppercase tracking-wide">Unavailable</span>
      </li>
    );
  }
  return (
    <li>
      <Link
        to="/crypto/$pair"
        params={{ pair: row.pair }}
        className="flex items-center justify-between rounded px-1 py-1 text-xs hover:bg-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-label={`${label} tokenized asset`}
      >
        <span className="flex items-center gap-2">
          <span className="text-foreground">{label}</span>
          <span className="rounded bg-amber-500/10 px-1 py-0.5 text-[9px] uppercase tracking-wide text-amber-300">
            Tokenized
          </span>
        </span>
        <span className="tabular-nums text-foreground">{fmtNum(row.last, 2)}</span>
      </Link>
    </li>
  );
}

export default CryptoMarketWidget;
