// Phase 3F — Admin CoinDCX diagnostics. Admin-only, gated by has_role.

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, Shield, Database } from "lucide-react";
import { getCoindcxDiagnostics } from "@/lib/providers/coindcx/coindcx.functions";

export const Route = createFileRoute("/_authenticated/admin/coindcx")({
  component: AdminCoindcxPage,
  head: () => ({
    meta: [
      { title: "Admin · CoinDCX" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  errorComponent: ({ error, reset }) => (
    <div className="p-6 text-sm text-red-300">
      <p>Admin diagnostics unavailable: {(error as Error).message}</p>
      <button onClick={reset} className="mt-2 rounded border border-border/60 px-2 py-1">Retry</button>
    </div>
  ),
  notFoundComponent: () => <div className="p-6">Not found</div>,
});

function AdminCoindcxPage() {
  const fn = useServerFn(getCoindcxDiagnostics);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-coindcx-diagnostics"],
    queryFn: () => fn(),
    staleTime: 30_000,
    retry: false,
  });

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">ADMIN · COINDCX PROVIDER</div>
          <h1 className="text-xl font-semibold text-foreground">CoinDCX Diagnostics</h1>
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

      {isLoading && <p className="text-sm text-muted-foreground">Loading diagnostics…</p>}
      {error && <p className="rounded border border-red-500/40 bg-red-500/5 p-3 text-sm text-red-300">{(error as Error).message}</p>}

      {data && (
        <>
          <section className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs">
            <div className="flex items-center gap-2 text-emerald-300">
              <Shield className="h-4 w-4" />
              <span className="font-semibold">EXECUTION GUARD ACTIVE</span>
            </div>
            <p className="mt-1 text-emerald-200/80">
              Trading is disabled at compile time (COINDCX_TRADING_ENABLED = false). Only public market-data endpoints are wired.
            </p>
          </section>

          <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Stat label="Markets discovered" value={data.discoveredMarkets} />
            <Stat label="Crypto majors" value={data.cryptoMajors} />
            <Stat label="Tokenized metals" value={data.tokenizedMetals} />
          </section>

          <section className="rounded-lg border border-border/60 bg-card/40 p-3 text-xs">
            <div className="mb-2 flex items-center gap-2 text-muted-foreground">
              <Database className="h-4 w-4" /> Allowlisted endpoints
            </div>
            <ul className="space-y-1 font-mono text-[11px] text-foreground/80">
              {data.endpointsAllowlisted.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </section>

          <section className="rounded-lg border border-border/60 bg-card/40 p-3 text-xs text-muted-foreground">
            <div>Last discovery: {data.lastDiscoveryAt ?? "—"}</div>
            <div>Last latency: {data.lastDiscoveryLatencyMs != null ? `${data.lastDiscoveryLatencyMs} ms` : "—"}</div>
            <div>Last error: {data.lastError ?? "none"}</div>
          </section>

          <section className="rounded-lg border border-border/60 bg-card/40 p-3 text-xs text-muted-foreground">
            <div className="mb-1 text-foreground/80 font-medium">Realtime & Widget Consumers</div>
            <div>WebSocket: not enabled (REST polling authoritative)</div>
            <div>Shared query key: <span className="font-mono">["coindcx-markets"]</span></div>
            <div>Reconnect count: 0</div>
            <div>Dropped messages: 0</div>
            <div>Average freshness target: 15 s</div>
            <div>Widget consumers: CryptoMarketWidget, CryptoHeatmapWidget, CryptoWatchlistWidget, CryptoSummaryWidget</div>
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
