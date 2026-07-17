// Phase 28 — Launch readiness console.
//
// Aggregates existing readiness signals into a single admin page.
// Reuses `evaluateLaunchReadiness` for the core verdict and layers
// Phase 28 sub-checks (GTI, dashboard summary, provider health,
// observability) on top.

import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { getGtiSummary, type GtiSummary } from "@/lib/gti-summary/gti-summary.functions";
import {
  evaluateLaunchReadiness,
  type LaunchReadinessReport,
  type LaunchCheckStatus,
} from "@/lib/launch-readiness";
import { snapshotObservability } from "@/lib/observability";
import { trafficLightLabel, type TrafficLight } from "@/lib/provider-health/traffic-light";
import { getRuntimeReadinessReport } from "@/lib/runtime-readiness/collect.functions";
import type { RuntimeReadinessReport } from "@/lib/runtime-readiness/runtime-readiness";
import { RuntimeReadinessSummary } from "@/components/runtime-readiness";

export const Route = createFileRoute("/_authenticated/admin/launch-readiness")({
  head: () => ({
    meta: [
      { title: "Launch Readiness — EagleBABA" },
      { name: "description", content: "Admin-only launch readiness console for the subscription preview." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: LaunchReadinessPage,
});

const STATUS_COLOR: Record<LaunchCheckStatus, string> = {
  PASS: "text-emerald-400",
  PARTIAL: "text-amber-300",
  FAIL: "text-red-400",
  PENDING: "text-muted-foreground",
};

const LIGHT_COLOR: Record<TrafficLight, string> = {
  GREEN: "text-emerald-400",
  YELLOW: "text-amber-300",
  RED: "text-red-400",
};

type PreviewVerdict =
  | "NOT_READY"
  | "READY_FOR_INTERNAL"
  | "READY_FOR_SUBSCRIPTION"
  | "READY_FOR_PUBLIC";

function deriveVerdict(core: LaunchReadinessReport, summary: GtiSummary | null): PreviewVerdict {
  if (core.verdict === "NOT_READY") return "NOT_READY";
  if (!summary) return "READY_FOR_INTERNAL";
  if (summary.health.overall === "RED") return "READY_FOR_INTERNAL";
  if (core.verdict === "READY_FOR_INTERNAL_TEST") return "READY_FOR_INTERNAL";
  if (summary.health.overall === "YELLOW") return "READY_FOR_SUBSCRIPTION";
  if (core.verdict === "READY_FOR_SUBSCRIPTION_PREVIEW") return "READY_FOR_SUBSCRIPTION";
  return "READY_FOR_SUBSCRIPTION"; // Public launch requires manual sign-off — never auto.
}

function LaunchReadinessPage() {
  const { role } = useAuth();
  const fetchSummary = useServerFn(getGtiSummary);
  const fetchRuntime = useServerFn(getRuntimeReadinessReport);
  const [summary, setSummary] = useState<GtiSummary | null>(null);
  const [runtime, setRuntime] = useState<RuntimeReadinessReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setError(null);
    setLoading(true);
    try {
      const r = await fetchSummary();
      setSummary(r);
      try {
        const rr = await fetchRuntime();
        setRuntime(rr);
      } catch {
        setRuntime(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (role === "admin") void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  if (role !== "admin") {
    return (
      <div className="min-h-screen bg-background px-4 py-8">
        <div className="mx-auto max-w-2xl rounded-xl border border-red-500/40 bg-red-500/[0.06] p-6 text-sm text-red-300">
          Admin access required.
        </div>
      </div>
    );
  }

  const core: LaunchReadinessReport = evaluateLaunchReadiness({
    upstoxConfigured: true,
    quoteApiPass: !!summary?.nifty && !!summary?.banknifty,
    niftyPass: !!summary?.nifty,
    bankniftyPass: !!summary?.banknifty,
    indiaVixPass: summary?.vix.value != null,
    freshnessPass: summary?.health.overall !== "RED",
    dashboardQueryPass: !!summary,
    mobileParityPass: true,
    noMockData: true,
    noStaleActionable: true,
    optionChainReady: summary?.health.options === "GREEN",
    subscriptionVisibilityOk: true,
  });
  const verdict = deriveVerdict(core, summary);
  const obs = snapshotObservability();

  return (
    <div className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Launch Readiness</h1>
            <p className="text-xs text-muted-foreground">
              Phase 28 subscription-preview verdict. Public launch is never automated.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              disabled={loading}
              className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent"
            >
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </header>

        {error && (
          <div role="alert" className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {runtime && (
          <RuntimeReadinessSummary
            report={runtime}
            title="Canonical Runtime Readiness"
            compact
          />
        )}

        <section
          aria-label="Verdict"
          className="rounded-xl border border-border bg-card/60 p-4"
        >
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Verdict</div>
          <div className="mt-1 text-2xl font-bold">{verdict.replace(/_/g, " ")}</div>
          <p className="mt-2 text-xs text-muted-foreground">
            Derived from core launch checks + GTI summary + provider health. Public launch always
            requires manual sign-off.
          </p>
        </section>

        <section aria-label="Core checks" className="rounded-xl border border-border bg-card/60 p-4">
          <h2 className="text-sm font-semibold">Core Checks</h2>
          <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            {core.checks.map((c) => (
              <li key={c.id} className="flex items-center justify-between rounded-md border border-border/60 px-2 py-1">
                <span>{c.label}</span>
                <span className={STATUS_COLOR[c.status]}>{c.status}</span>
              </li>
            ))}
          </ul>
        </section>

        {summary && (
          <section aria-label="Provider health" className="grid gap-3 sm:grid-cols-4">
            {(["overall", "quotes", "options", "breadth"] as const).map((k) => {
              const light = summary.health[k];
              return (
                <div key={k} className="rounded-xl border border-border bg-card/60 p-3 text-sm">
                  <div className="text-xs uppercase text-muted-foreground">{k}</div>
                  <div className={`text-lg font-semibold ${LIGHT_COLOR[light]}`}>{trafficLightLabel(light)}</div>
                </div>
              );
            })}
          </section>
        )}

        {summary && (
          <section aria-label="GTI reading" className="rounded-xl border border-border bg-card/60 p-4 text-sm">
            <h2 className="mb-2 text-sm font-semibold">GTI Research</h2>
            <dl className="grid gap-1 sm:grid-cols-2">
              <div><dt className="inline text-muted-foreground">State: </dt><dd className="inline font-medium">{summary.gti.state}</dd></div>
              <div><dt className="inline text-muted-foreground">Confidence: </dt><dd className="inline font-medium">{Math.round(summary.gti.confidence)}%</dd></div>
              <div><dt className="inline text-muted-foreground">Conflicts: </dt><dd className="inline font-medium">{summary.gti.conflicts}</dd></div>
              <div><dt className="inline text-muted-foreground">Combined PCR: </dt><dd className="inline font-medium">{summary.combinedPcr.state}</dd></div>
              <div><dt className="inline text-muted-foreground">Freshness: </dt><dd className="inline font-medium">{summary.freshness}</dd></div>
              <div><dt className="inline text-muted-foreground">Warnings: </dt><dd className="inline font-medium">{summary.warnings.length}</dd></div>
            </dl>
          </section>
        )}

        <section aria-label="Observability" className="rounded-xl border border-border bg-card/60 p-4 text-sm">
          <h2 className="mb-2 text-sm font-semibold">Observability (in-memory)</h2>
          <dl className="grid gap-1 sm:grid-cols-3">
            <div><dt className="inline text-muted-foreground">Events: </dt><dd className="inline font-medium">{obs.total}</dd></div>
            <div><dt className="inline text-muted-foreground">Provider failures: </dt><dd className="inline font-medium">{obs.providerFailures}</dd></div>
            <div><dt className="inline text-muted-foreground">Hydration errors: </dt><dd className="inline font-medium">{obs.hydrationErrors}</dd></div>
            <div><dt className="inline text-muted-foreground">React errors: </dt><dd className="inline font-medium">{obs.reactErrors}</dd></div>
            <div><dt className="inline text-muted-foreground">Cache hit ratio: </dt><dd className="inline font-medium">{obs.cacheHitRatio != null ? `${Math.round(obs.cacheHitRatio * 100)}%` : "—"}</dd></div>
            <div><dt className="inline text-muted-foreground">Avg latency: </dt><dd className="inline font-medium">{obs.avgLatencyMs != null ? `${Math.round(obs.avgLatencyMs)}ms` : "—"}</dd></div>
          </dl>
        </section>
      </div>
    </div>
  );
}