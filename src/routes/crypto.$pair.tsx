// Phase 3F — Crypto pair detail (candles). Market data only.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { getCoindcxCandles } from "@/lib/providers/coindcx/coindcx.functions";
import type { CoindcxSupportedInterval } from "@/lib/providers/coindcx";

export const Route = createFileRoute("/crypto/$pair")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.pair} — Crypto Candles · EagleBABA` },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CryptoPairPage,
});

const INTERVALS: readonly CoindcxSupportedInterval[] = ["1m", "5m", "15m", "1h", "1d"];

function CryptoPairPage() {
  const { pair } = Route.useParams();
  const [interval, setInterval] = useState<CoindcxSupportedInterval>("15m");
  const fn = useServerFn(getCoindcxCandles);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["coindcx-candles", pair, interval],
    queryFn: () => fn({ data: { pair, interval } }),
    staleTime: 10_000,
    retry: false,
  });

  const candles = data?.candles ?? [];
  const first = candles[0]?.close ?? null;
  const last = candles[candles.length - 1]?.close ?? null;
  const changePct = first != null && last != null && first !== 0 ? ((last - first) / first) * 100 : null;

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link to="/crypto" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3 w-3" /> Markets
          </Link>
          <h1 className="mt-1 text-xl font-semibold">{pair}</h1>
          <p className="text-xs text-muted-foreground">Public candles · 24×7 · market data only</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={interval}
            onChange={(e) => setInterval(e.target.value as CoindcxSupportedInterval)}
            className="rounded border border-border/60 bg-background px-2 py-1 text-xs"
          >
            {INTERVALS.map((i) => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-1 rounded border border-border/60 px-3 py-1 text-xs"
            disabled={isFetching}
            type="button"
          >
            <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </header>

      {isLoading && <p className="text-sm text-muted-foreground">Loading candles…</p>}
      {error && <p className="rounded border border-red-500/40 bg-red-500/5 p-3 text-sm text-red-300">Unable to load candles.</p>}

      {data && (
        <section className="rounded-lg border border-border/60 bg-card/40 p-3 text-xs">
          <div className="flex flex-wrap items-baseline gap-4">
            <div>
              <div className="text-muted-foreground">Last</div>
              <div className="text-lg font-semibold tabular-nums">{last?.toLocaleString() ?? "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Window change</div>
              <div className={`text-lg tabular-nums ${(changePct ?? 0) >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                {changePct != null ? `${changePct.toFixed(2)}%` : "—"}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Candles</div>
              <div className="text-lg tabular-nums">{candles.length}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Source</div>
              <div className="text-lg">{data.meta.status}</div>
            </div>
          </div>
        </section>
      )}

      {candles.length > 0 && (
        <section className="overflow-x-auto rounded-lg border border-border/60 bg-card/40">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr className="border-b border-border/30">
                <th className="px-3 py-2 text-left font-normal">Time</th>
                <th className="px-3 py-2 text-right font-normal">Open</th>
                <th className="px-3 py-2 text-right font-normal">High</th>
                <th className="px-3 py-2 text-right font-normal">Low</th>
                <th className="px-3 py-2 text-right font-normal">Close</th>
                <th className="px-3 py-2 text-right font-normal">Volume</th>
              </tr>
            </thead>
            <tbody>
              {candles.slice(-50).reverse().map((c) => (
                <tr key={c.time} className="border-b border-border/20 last:border-0 tabular-nums">
                  <td className="px-3 py-1">{c.time.slice(0, 16).replace("T", " ")}</td>
                  <td className="px-3 py-1 text-right">{c.open}</td>
                  <td className="px-3 py-1 text-right">{c.high}</td>
                  <td className="px-3 py-1 text-right">{c.low}</td>
                  <td className="px-3 py-1 text-right font-medium">{c.close}</td>
                  <td className="px-3 py-1 text-right text-muted-foreground">{c.volume ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
