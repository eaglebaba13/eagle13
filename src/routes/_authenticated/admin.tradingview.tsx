// Phase 3F.2B — Admin-only TradingView spike diagnostics.
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw } from "lucide-react";
import { getTradingViewDiagnostics } from "@/lib/tradingview/tradingview.functions";

export const Route = createFileRoute("/_authenticated/admin/tradingview")({
  component: AdminTradingViewPage,
  head: () => ({
    meta: [
      { title: "Admin · TradingView Spike" },
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
            ADMIN · TRADINGVIEW SPIKE (Phase 3F.2B)
          </div>
          <h1 className="text-xl font-semibold text-foreground">TradingView Provider Feasibility</h1>
          <p className="text-xs text-muted-foreground">
            Isolated spike. Not wired to any dashboard or widget.
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
        <Row label="Import status" value={data?.importStatus} />
        <Row label="Import error" value={data?.importError} />
        <Row
          label="WebSocket connected"
          value={data?.websocketConnected ? "true" : "false"}
        />
        <Row label="Symbol resolved" value={data?.symbolResolved ? "true" : "false"} />
        <Row label="Latest ratio" value={data?.latest?.value?.toFixed(4) ?? "—"} />
        <Row label="Last update" value={data?.latest?.timestamp ?? "—"} />
        <Row label="Freshness" value={data?.latest?.freshness ?? "UNAVAILABLE"} />
        <Row label="Exchange" value={data?.latest?.source?.exchange ?? "—"} />
        <Row label="Description" value={data?.latest?.source?.description ?? "—"} />
        <Row label="Attempt error" value={data?.attemptError ?? "—"} />
        <Row label="Checked at" value={data?.checkedAt ?? "—"} />
      </section>

      <p className="text-xs text-muted-foreground">
        The `@mathieuc/tradingview` package depends on Node's `ws` module. On the Cloudflare
        Worker runtime the dynamic import is expected to fail; this route surfaces that state
        without breaking the production build.
      </p>
    </div>
  );
}
