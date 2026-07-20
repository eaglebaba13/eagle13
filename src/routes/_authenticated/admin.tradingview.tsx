// Phase 3F.2C — Admin-only TradingView collector diagnostics. Talks to the
// external Node collector service via a server-only bearer secret. Never
// imports @mathieuc/tradingview.
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw } from "lucide-react";
import { getTradingViewDiagnostics } from "@/lib/tradingview/tradingview.functions";

export const Route = createFileRoute("/_authenticated/admin/tradingview")({
  component: AdminTradingViewPage,
  head: () => ({
    meta: [
      { title: "Admin · TradingView Collector" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  errorComponent: ({ error, reset }) => (
    <div className="p-6 text-sm text-red-300">
      <p>Diagnostics unavailable: {(error as Error).message}</p>
      <button onClick={reset} className="mt-2 rounded border border-border/60 px-2 py-1">
        Retry
      </button>
    </div>
  ),
  notFoundComponent: () => <div className="p-6">Not found</div>,
});

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/40 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-foreground">{value ?? "—"}</span>
    </div>
  );
}

function AdminTradingViewPage() {
  const fn = useServerFn(getTradingViewDiagnostics);
  const { data, isFetching, refetch, error } = useQuery({
    queryKey: ["admin-tradingview-diagnostics"],
    queryFn: () => fn(),
    staleTime: 15_000,
    retry: false,
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            ADMIN · TRADINGVIEW COLLECTOR (Phase 3F.2C)
          </div>
          <h1 className="text-xl font-semibold text-foreground">TradingView Gold/Silver Ratio Collector</h1>
          <p className="text-xs text-muted-foreground">
            External Node service. Cloudflare app calls it via a server-only bearer secret.
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

      {error ? (
        <div className="rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
          {(error as Error).message}
        </div>
      ) : null}

      <section className="rounded border border-border/60 bg-card/40 p-4">
        <Row label="Symbol" value={data?.symbol ?? "TVC:GOLDSILVER"} />
        <Row label="Collector enabled" value={data?.collector?.enabled ? "true" : "false"} />
        <Row label="Collector URL configured" value={data?.collector?.urlConfigured ? "true" : "false"} />
        <Row
          label="API token configured"
          value={
            data?.collector?.tokenConfigured
              ? `yes · ${data.collector.tokenMasked ?? "•••"}`
              : "no"
          }
        />
        <Row label="Base URL" value={data?.collector?.baseUrl ?? "—"} />
        <Row label="Health status" value={data?.health?.status ?? "—"} />
        <Row label="Connected" value={data?.health?.connected ? "true" : "false"} />
        <Row label="Symbol resolved" value={data?.health?.symbolResolved ? "true" : "false"} />
        <Row label="Last collector update" value={data?.health?.lastUpdateAt ?? "—"} />
        <Row label="Error count" value={data?.health?.errorCount ?? 0} />
        <Row label="Reconnect count" value={data?.health?.reconnectCount ?? 0} />
        <Row label="Ratio" value={data?.snapshot?.ratio?.toFixed(4) ?? "—"} />
        <Row label="Signal" value={data?.snapshot?.signal ?? "UNAVAILABLE"} />
        <Row label="Freshness" value={data?.snapshot?.freshness ?? "UNAVAILABLE"} />
        <Row label="Age (ms)" value={data?.snapshot?.ageMs ?? "—"} />
        <Row label="Market timestamp" value={data?.snapshot?.marketTimestamp ?? "—"} />
        <Row label="Received at" value={data?.snapshot?.receivedAt ?? "—"} />
        <Row label="Last successful fetch" value={data?.lastSuccessAt ?? "—"} />
        <Row label="Last failure reason" value={data?.lastFailureReason ?? "—"} />
        <Row label="Health endpoint error" value={data?.healthError ?? "—"} />
        <Row label="Checked at" value={data?.checkedAt ?? "—"} />
      </section>

      <p className="text-xs text-muted-foreground">
        The Cloudflare application never imports `@mathieuc/tradingview`. This page verifies
        the isolated Node collector service (`services/tradingview-ratio-collector/`) is
        reachable, authenticated, and returning fresh snapshots. Secrets are never displayed.
      </p>
    </div>
  );
}