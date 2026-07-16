import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { getProductionReadinessReport } from "@/lib/readiness/readiness.functions";
import type { ProductionReadinessReport } from "@/lib/readiness/production-readiness-types";
import {
  categoryCsv,
  deploymentEvidenceBundle,
  fullReadinessJson,
  hardBlockersCsv,
  readinessSummaryCsv,
} from "@/lib/readiness/readiness-exports";
import { INCIDENT_PLAYBOOKS } from "@/lib/readiness/incident-readiness";
import { downloadBlob } from "@/lib/download";

export const Route = createFileRoute("/_authenticated/admin/readiness")({
  head: () => ({
    meta: [
      { title: "Production Readiness — EagleBABA" },
      {
        name: "description",
        content:
          "Admin-only production readiness center: security, RLS, providers, cache, scheduler, storage, payments and recovery.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AdminReadinessPage,
});

const VERDICT_COLORS: Record<string, string> = {
  DEPLOYMENT_BLOCKED: "bg-red-500/20 text-red-300 border-red-500/40",
  NOT_READY: "bg-red-500/10 text-red-300 border-red-500/30",
  READY_FOR_STAGING: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  STAGING_VALIDATION_REQUIRED: "bg-amber-500/10 text-amber-200 border-amber-500/30",
  READY_FOR_LIMITED_PRODUCTION: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  PRODUCTION_REVIEW_REQUIRED: "bg-emerald-500/10 text-emerald-200 border-emerald-500/30",
};

function AdminReadinessPage() {
  const { role } = useAuth();
  const fetchReport = useServerFn(getProductionReadinessReport);
  const [report, setReport] = useState<ProductionReadinessReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setErr(null);
    setLoading(true);
    try {
      const r = await fetchReport();
      setReport(r);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (role === "admin") void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const categories = useMemo(() => {
    if (!report) return [] as Array<{ id: string; total: number; results: typeof report.results }>;
    const groups = new Map<string, typeof report.results>();
    for (const r of report.results) {
      const arr = groups.get(r.category) ?? [];
      arr.push(r);
      groups.set(r.category, arr);
    }
    return Array.from(groups.entries()).map(([id, results]) => ({
      id,
      total: results.length,
      results,
    }));
  }, [report]);

  if (role !== "admin") {
    return (
      <div className="min-h-screen bg-background px-4 py-8">
        <div className="mx-auto max-w-2xl rounded-xl border border-red-500/40 bg-red-500/[0.06] p-6 text-sm text-red-300">
          Admin access required.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Production Readiness</h1>
            <p className="text-sm text-muted-foreground">
              Admin-only evidence-backed audit. Never contains secret values.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={load}
              disabled={loading}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-accent"
            >
              {loading ? "Running…" : "Re-run"}
            </button>
            {report && (
              <>
                <button
                  onClick={() => downloadBlob(readinessSummaryCsv(report), `readiness-summary-${report.runId}.csv`, "text/csv")}
                  className="rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-accent"
                >
                  Summary CSV
                </button>
                <button
                  onClick={() => downloadBlob(hardBlockersCsv(report), `readiness-blockers-${report.runId}.csv`, "text/csv")}
                  className="rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-accent"
                >
                  Blockers CSV
                </button>
                <button
                  onClick={() => downloadBlob(fullReadinessJson(report), `readiness-${report.runId}.json`, "application/json")}
                  className="rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-accent"
                >
                  Full JSON
                </button>
                <button
                  onClick={() =>
                    downloadBlob(
                      deploymentEvidenceBundle(report),
                      `readiness-evidence-${report.runId}.json`,
                      "application/json",
                    )
                  }
                  className="rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-accent"
                >
                  Evidence Bundle
                </button>
              </>
            )}
          </div>
        </header>

        {err && (
          <div className="rounded-md border border-red-500/40 bg-red-500/[0.06] p-3 text-sm text-red-300">
            {err}
          </div>
        )}

        {report && (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <div
                className={`rounded-xl border p-4 ${
                  VERDICT_COLORS[report.verdict] ?? "border-border bg-muted/20"
                }`}
              >
                <p className="text-xs uppercase tracking-wide opacity-80">Verdict</p>
                <p className="mt-1 text-lg font-semibold">{report.verdict.replace(/_/g, " ")}</p>
                <p className="mt-2 text-xs opacity-70">Run: {report.runId}</p>
              </div>
              <div className="rounded-xl border border-border bg-muted/10 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Score</p>
                <p className="mt-1 text-3xl font-bold text-foreground">{report.score.total}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {report.score.hardBlockerCount} hard blocker(s) · override {report.score.overrideBlocked ? "BLOCKED" : "allowed"}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-muted/10 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Environment</p>
                <p className="mt-1 text-lg font-semibold text-foreground">{report.environment}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  build={report.buildVersion ?? "unknown"} · target={report.deploymentTarget ?? "unknown"}
                </p>
              </div>
            </div>

            {report.blockers.length > 0 && (
              <section className="rounded-xl border border-red-500/40 bg-red-500/[0.05] p-4">
                <h2 className="text-sm font-semibold text-red-300">
                  Hard blockers ({report.blockers.length})
                </h2>
                <ul className="mt-2 space-y-1 text-sm text-red-200/90">
                  {report.blockers.map((b) => (
                    <li key={b.id}>
                      <span className="font-mono text-xs text-red-300/70">{b.category}</span>{" "}
                      <span className="font-medium">{b.title}</span> — {b.detail}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {report.score.categories.map((c) => (
                <div key={c.category} className="rounded-xl border border-border bg-muted/5 p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-foreground">{c.category}</h3>
                    <span className="text-lg font-semibold text-foreground">{c.score}</span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    ✓ {c.passCount} · ⚠ {c.warnCount} · ✗ {c.failCount}
                  </p>
                  <button
                    onClick={() =>
                      downloadBlob(
                        categoryCsv(report, c.category),
                        `readiness-${c.category.toLowerCase()}-${report.runId}.csv`,
                        "text/csv",
                      )
                    }
                    className="mt-3 rounded border border-border px-2 py-1 text-xs hover:bg-accent"
                  >
                    Export CSV
                  </button>
                </div>
              ))}
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">All checks</h2>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-muted/20 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Category</th>
                      <th className="px-3 py-2">Check</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.results.map((r) => (
                      <tr key={r.id} className="border-t border-border/60">
                        <td className="px-3 py-1.5 text-xs text-muted-foreground">{r.category}</td>
                        <td className="px-3 py-1.5 text-foreground">{r.title}</td>
                        <td
                          className={`px-3 py-1.5 text-xs font-semibold ${
                            r.status === "PASS"
                              ? "text-emerald-400"
                              : r.status === "WARNING"
                              ? "text-amber-300"
                              : r.status === "FAIL" || r.status === "MISSING"
                              ? "text-red-400"
                              : "text-muted-foreground"
                          }`}
                        >
                          {r.status}
                          {r.hardBlocker ? " · BLOCKER" : ""}
                        </td>
                        <td className="px-3 py-1.5 text-xs text-muted-foreground">
                          {r.detail ?? ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-xl border border-border bg-muted/5 p-4">
              <h2 className="text-sm font-semibold text-foreground">Incident readiness</h2>
              <ul className="mt-2 grid gap-2 md:grid-cols-2">
                {INCIDENT_PLAYBOOKS.map((p) => (
                  <li key={p.id} className="rounded border border-border/60 p-3 text-xs">
                    <p className="font-semibold text-foreground">{p.scenario}</p>
                    <p className="mt-1 text-muted-foreground">Detect: {p.detection}</p>
                    <p className="text-muted-foreground">Action: {p.immediateAction}</p>
                    <p className="text-muted-foreground">Owner: {p.escalationOwner}</p>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

// ignore unused warnings for helper vars in some builds
void categories;
