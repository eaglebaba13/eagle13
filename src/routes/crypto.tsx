// Phase 3F — Public CoinDCX crypto market surface.
// Market-data only. No trading actions rendered.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, ExternalLink } from "lucide-react";
import { listCoindcxMarkets } from "@/lib/providers/coindcx/coindcx.functions";

export const Route = createFileRoute("/crypto")({
  head: () => ({
    meta: [
      { title: "Crypto & Tokenized Metals — Market Data · EagleBABA" },
      { name: "description", content: "24×7 crypto and tokenized metal reference data via CoinDCX public market feeds. Market data only — no trading." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CryptoMarketsPage,
});

function fmt(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function CryptoMarketsPage() {
  const fn = useServerFn(listCoindcxMarkets);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["coindcx-markets"],
    queryFn: () => fn(),
    staleTime: 10_000,
    refetchInterval: 15_000,
    retry: false,
  });

  const snapshots = data?.snapshots ?? [];
  const crypto = snapshots.filter((s) => s.market.assetClass === "CRYPTO_MAJOR");
  const metals = snapshots.filter((s) => s.market.assetClass === "TOKENIZED_METAL");

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">CRYPTO & TOKENIZED METALS · COINDCX PUBLIC</div>
          <h1 className="text-xl font-semibold text-foreground">Multi-Asset Market Data</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Reference market data from CoinDCX public endpoints. 24×7 sessions. Trading is not enabled from this application.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-1 rounded border border-border/60 px-3 py-1 text-xs"
          disabled={isFetching}
          type="button"
        >
          <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </button>
      </header>

      {isLoading && <p className="text-sm text-muted-foreground">Loading markets…</p>}
      {error && (
        <p className="rounded border border-red-500/40 bg-red-500/5 p-3 text-sm text-red-300">
          Unable to load markets: {(error as Error).message}
        </p>
      )}

      <Section title="Crypto Majors" rows={crypto} formatter={fmt} />
      <Section title="Tokenized Metals (Reference Only)" rows={metals} formatter={fmt} disclaimer />

      <footer className="pt-4 text-[11px] text-muted-foreground">
        Data source: CoinDCX public API. Tokenized metals (PAXG, XAUT, KAG) are ERC-20 representations that
        track spot metals; they are NOT the physical instrument and are not consumed by the Gold/Silver trading
        formulas. Nothing on this page is investment advice.
      </footer>
    </div>
  );
}

function Section({
  title,
  rows,
  formatter,
  disclaimer,
}: {
  title: string;
  rows: { market: { pair: string; base: string; quote: string; linkedUnderlying: "GOLD" | "SILVER" | null; notes: readonly string[] }; ticker: { last: number; change24hPct: number | null; volume24h: number | null; high24h: number | null; low24h: number | null } | null }[];
  formatter: (n: number | null | undefined, digits?: number) => string;
  disclaimer?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="rounded-lg border border-border/60 bg-card/40">
      <div className="flex items-center justify-between border-b border-border/40 px-3 py-2">
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
        {disclaimer && (
          <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-300">
            Tokenized · Not Physical
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr className="border-b border-border/30">
              <th className="px-3 py-2 text-left font-normal">Pair</th>
              <th className="px-3 py-2 text-right font-normal">Last</th>
              <th className="px-3 py-2 text-right font-normal">24h %</th>
              <th className="px-3 py-2 text-right font-normal">24h High</th>
              <th className="px-3 py-2 text-right font-normal">24h Low</th>
              <th className="px-3 py-2 text-right font-normal">Volume</th>
              <th className="px-3 py-2 text-left font-normal">Links</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ market, ticker }) => (
              <tr key={market.pair} className="border-b border-border/20 last:border-0">
                <td className="px-3 py-2 font-medium text-foreground">
                  {market.base}
                  <span className="text-muted-foreground">/{market.quote}</span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatter(ticker?.last, 2)}</td>
                <td
                  className={`px-3 py-2 text-right tabular-nums ${
                    (ticker?.change24hPct ?? 0) >= 0 ? "text-emerald-300" : "text-red-300"
                  }`}
                >
                  {ticker?.change24hPct != null ? `${ticker.change24hPct.toFixed(2)}%` : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatter(ticker?.high24h, 2)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatter(ticker?.low24h, 2)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatter(ticker?.volume24h, 4)}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {market.linkedUnderlying ? (
                    <span className="inline-flex items-center gap-1">
                      Tracks {market.linkedUnderlying}
                      <ExternalLink className="h-3 w-3" />
                    </span>
                  ) : (
                    <Link
                      to="/crypto/$pair"
                      params={{ pair: market.pair }}
                      className="text-primary hover:underline"
                    >
                      Candles
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
