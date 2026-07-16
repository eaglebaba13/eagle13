import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { getStagingValidationReport } from "@/lib/readiness/staging/staging.functions";
import type { StagingValidationReport } from "@/lib/readiness/staging/staging-validation-types";
import {
  authorizationCsv,
  bundleAuditCsv,
  fullStagingReportJson,
  incidentDrillCsv,
  journeyResultsCsv,
  loadTestCsv,
  performanceCsv,
  providerDrillCsv,
  recoveryDrillCsv,
  releaseChecklistCsv,
  stagingEvidenceBundleJson,
  stagingSummaryCsv,
} from "@/lib/readiness/staging/staging-exports";
import { downloadBlob } from "@/lib/download";

export const Route = createFileRoute("/_authenticated/admin/staging-validation")({
  head: () => ({
    meta: [
      { title: "Staging Validation — EagleBABA" },
      {
        name: "description",
        content: "Admin-only staging validation: journeys, drills, performance, recovery, exports.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AdminStagingValidationPage,
});

const VERDICT_COLORS: Record<string, string> = {
  STAGING_NOT_CONFIGURED: "bg-muted/20 text-muted-foreground border-border",
  STAGING_BLOCKED: "bg-red-500/20 text-red-300 border-red-500/40",
  STAGING_FAILED: "bg-red-500/10 text-red-300 border-red-500/30",
  STAGING_PARTIAL: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  STAGING_VALIDATED: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  READY_FOR_LIMITED_PRODUCTION_REVIEW: "bg-emerald-500/10 text-emerald-200 border-emerald-500/30",
};

function AdminStagingValidationPage() {
  const { role } = useAuth();
  const fetchReport = useServerFn(getStagingValidationReport);
  const [report, setReport] = useState<StagingValidationReport | null>(null);
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
            <h1 className="text-2xl font-semibold text-foreground">Staging Validation</h1>
            <p className="text-sm text-muted-foreground">
              Admin-only staging evidence. Never contains secret values. No deploy button.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={load}
              disabled={loading}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-accent"
            >
              {loading ? "Running…" : "Run Full Validation"}
            </button>
            {report && (
              <>
                <button onClick={() => downloadBlob(stagingSummaryCsv(report), `staging-summary-${report.runId}.csv`, "text/csv")} className="rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-accent">Summary CSV</button>
                <button onClick={() => downloadBlob(journeyResultsCsv(report), `staging-journeys-${report.runId}.csv`, "text/csv")} className="rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-accent">Journeys CSV</button>
                <button onClick={() => downloadBlob(providerDrillCsv(report), `staging-providers-${report.runId}.csv`, "text/csv")} className="rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-accent">Providers CSV</button>
                <button onClick={() => downloadBlob(authorizationCsv(report), `staging-authz-${report.runId}.csv`, "text/csv")} className="rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-accent">Authz CSV</button>
                <button onClick={() => downloadBlob(performanceCsv(report), `staging-perf-${report.runId}.csv`, "text/csv")} className="rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-accent">Performance CSV</button>
                <button onClick={() => downloadBlob(bundleAuditCsv(report), `staging-bundle-${report.runId}.csv`, "text/csv")} className="rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-accent">Bundle CSV</button>
                <button onClick={() => downloadBlob(loadTestCsv(report), `staging-load-${report.runId}.csv`, "text/csv")} className="rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-accent">Load CSV</button>
                <button onClick={() => downloadBlob(recoveryDrillCsv(report), `staging-recovery-${report.runId}.csv`, "text/csv")} className="rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-accent">Recovery CSV</button>
                <button onClick={() => downloadBlob(incidentDrillCsv(report), `staging-incident-${report.runId}.csv`, "text/csv")} className="rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-accent">Incident CSV</button>
                <button onClick={() => downloadBlob(releaseChecklistCsv(report), `staging-release-${report.runId}.csv`, "text/csv")} className="rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-accent">Release CSV</button>
                <button onClick={() => downloadBlob(fullStagingReportJson(report), `staging-${report.runId}.json`, "application/json")} className="rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-accent">Full JSON</button>
                <button onClick={() => downloadBlob(stagingEvidenceBundleJson(report), `staging-evidence-${report.runId}.json`, "application/json")} className="rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-accent">Evidence Bundle</button>
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
              <div className={`rounded-xl border p-4 ${VERDICT_COLORS[report.verdict] ?? "border-border bg-muted/20"}`}>
                <p className="text-xs uppercase tracking-wide opacity-80">Verdict</p>
                <p className="mt-1 text-lg font-semibold">{report.verdict.replace(/_/g, " ")}</p>
                <p className="mt-2 text-xs opacity-70">Run: {report.runId}</p>
              </div>
              <div className="rounded-xl border border-border bg-muted/10 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Score</p>
                <p className="mt-1 text-3xl font-bold text-foreground">{report.score.total}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  ✓ {report.score.passCount} · ⚠ {report.score.warnCount} · ✗ {report.score.failCount} · blockers {report.score.hardBlockerCount}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-muted/10 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Environment</p>
                <p className="mt-1 text-lg font-semibold text-foreground">{report.environment}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  host={report.stagingHost ?? "—"} · build={report.buildVersion ?? "—"} · commit={report.commitVersion ?? "—"}
                </p>
              </div>
            </div>

            {report.blockers.length > 0 && (
              <section className="rounded-xl border border-red-500/40 bg-red-500/[0.05] p-4">
                <h2 className="text-sm font-semibold text-red-300">Hard blockers ({report.blockers.length})</h2>
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

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">Journeys</h2>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {report.journeys.map((j) => (
                  <div key={j.id} className="rounded-xl border border-border bg-muted/5 p-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-foreground">{j.title}</h3>
                      <span className="text-xs text-muted-foreground">{j.role}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{j.status} · {j.durationMs}ms · {j.steps.length} steps</p>
                    {j.failure && <p className="mt-1 text-xs text-red-300">step={j.failure.stepId} — {j.failure.message}</p>}
                  </div>
                ))}
              </div>
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
                    {report.checks.map((c) => (
                      <tr key={c.id} className="border-t border-border/60">
                        <td className="px-3 py-1.5 text-xs text-muted-foreground">{c.category}</td>
                        <td className="px-3 py-1.5 text-foreground">{c.title}</td>
                        <td className={`px-3 py-1.5 text-xs font-semibold ${
                          c.status === "PASS" ? "text-emerald-400" :
                          c.status === "WARNING" ? "text-amber-300" :
                          c.status === "FAIL" || c.status === "BLOCKED" ? "text-red-400" :
                          "text-muted-foreground"
                        }`}>{c.status}{c.hardBlocker ? " · BLOCKER" : ""}</td>
                        <td className="px-3 py-1.5 text-xs text-muted-foreground">{c.detail ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}