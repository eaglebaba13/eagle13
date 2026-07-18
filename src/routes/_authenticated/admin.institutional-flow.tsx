// Phase 3D-1 — Admin Institutional Flow diagnostics.
// Read-only aggregate view over the canonical Institutional Flow report.
// No provider payloads or PII surfaced; safe for admin export.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, RefreshCw } from "lucide-react";
import { useState } from "react";
import { getInstitutionalFlow } from "@/lib/institutional-flow/institutional-flow.functions";
import type { OptionUnderlying } from "@/lib/option-chain/types";

export const Route = createFileRoute("/_authenticated/admin/institutional-flow")({
  component: AdminInstitutionalFlowPage,
  head: () => ({
    meta: [
      { title: "Admin · Institutional Flow" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  errorComponent: ({ error, reset }) => (
    <div className="p-6 text-sm text-red-300">
      <p>Admin diagnostics unavailable: {(error as Error).message}</p>
      <button onClick={reset} className="mt-2 rounded border border-border/60 px-2 py-1">
        Retry
      </button>
    </div>
  ),
  notFoundComponent: () => <div className="p-6">Not found</div>,
});

function pct(x: number): string {
  return `${(x * 100).toFixed(0)}%`;
}

function AdminInstitutionalFlowPage() {
  const [underlying, setUnderlying] = useState<OptionUnderlying>("NIFTY");
  const fn = useServerFn(getInstitutionalFlow);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-institutional-flow", underlying],
    queryFn: () => fn({ data: { underlying } }),
    staleTime: 30_000,
    retry: false,
  });

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground">
            <Activity size={18} aria-hidden /> Institutional Flow · Admin diagnostics
          </h1>
          <p className="text-xs text-muted-foreground">
            Read-only. Consumer of canonical Option Chain — never fetches providers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div role="tablist" aria-label="Underlying" className="inline-flex rounded-md border border-border/60 text-xs">
            {(["NIFTY", "BANKNIFTY"] as const).map((u) => (
              <button
                key={u}
                role="tab"
                aria-selected={underlying === u}
                onClick={() => setUnderlying(u)}
                className={`px-3 py-1.5 ${underlying === u ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/40"}`}
              >
                {u}
              </button>
            ))}
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background px-3 py-1.5 text-xs hover:bg-muted/40 disabled:opacity-50"
          >
            <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} aria-hidden /> Reload
          </button>
          <Link to="/institutional-flow" className="text-xs text-sky-300 hover:underline">
            Open dashboard →
          </Link>
        </div>
      </header>

      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {error && <div className="text-sm text-red-300">Failed to load diagnostics.</div>}

      {data && (
        <>
          <section className="rounded-lg border border-border/60 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-medium text-foreground">
                  Source · {data.source} · Bias · {data.summary.bias.replace(/_/g, " ")}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Generated {data.generatedAt} · v{data.diagnostics.methodologyVersion}
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground">
                Snapshot · {data.diagnostics.snapshotProvider} · {data.diagnostics.snapshotFreshness} ·{" "}
                {data.diagnostics.snapshotTimestamp ?? "—"}
              </div>
            </div>
          </section>

          <section className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <Card title="Strike coverage" value={String(data.diagnostics.strikeCoverage)} />
            <Card title="Call OI coverage" value={pct(data.diagnostics.callOiCoverage)} />
            <Card title="Put OI coverage" value={pct(data.diagnostics.putOiCoverage)} />
            <Card title="ΔOI coverage" value={pct(data.diagnostics.changeOiCoverage)} />
            <Card title="Volume coverage" value={pct(data.diagnostics.volumeCoverage)} />
            <Card title="IV coverage" value={pct(data.diagnostics.ivCoverage)} />
            <Card title="Greeks coverage" value={pct(data.diagnostics.greeksCoverage)} />
            <Card title="Sector coverage" value={pct(data.diagnostics.sectorCoverage)} />
            <Card title="Processing" value={`${data.diagnostics.processingMs} ms`} />
          </section>

          <section className="rounded-lg border border-border/60 p-3">
            <h2 className="mb-2 text-sm font-semibold text-foreground">Calculation availability</h2>
            <ul className="grid gap-1 text-xs text-muted-foreground md:grid-cols-2">
              <li>OI · {data.oi.availability}</li>
              <li>Build-up · {data.buildUp.availability}</li>
              <li>Max Pain · {data.diagnostics.maxPainAvailability}</li>
              <li>Gamma · {data.diagnostics.gammaAvailability}{data.diagnostics.missingGreeksReason ? ` · ${data.diagnostics.missingGreeksReason}` : ""}</li>
              <li>Sector Flow · {data.sectorFlow.availability}</li>
              <li>Internals · {data.internals.availability}</li>
            </ul>
          </section>

          <section className="rounded-lg border border-border/60 p-3">
            <h2 className="mb-2 text-sm font-semibold text-foreground">Methodology</h2>
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Max Pain:</span> {data.diagnostics.maxPainMethodology}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Build-up:</span> {data.diagnostics.buildUpMethodology}
            </p>
          </section>

          {data.diagnostics.warnings.length > 0 && (
            <section className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-200">
              <h2 className="mb-1 text-sm font-semibold">Warnings</h2>
              <ul className="list-inside list-disc space-y-1">
                {data.diagnostics.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </section>
          )}

          {data.diagnostics.unavailableCalculations.length > 0 && (
            <section className="rounded-lg border border-red-500/40 bg-red-500/5 p-3 text-xs text-red-200">
              <h2 className="mb-1 text-sm font-semibold">Unavailable calculations</h2>
              <ul className="list-inside list-disc space-y-1">
                {data.diagnostics.unavailableCalculations.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="mt-1 text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}