import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  defaultVerificationReport,
  type CheckStatus,
  type ChecklistCategory,
} from "@/lib/production-verification";
import { useRuntimeReadinessQuery } from "@/lib/runtime-readiness/use-runtime-readiness";
import { RuntimeReadinessSummary } from "@/components/runtime-readiness";

export const Route = createFileRoute("/_authenticated/admin/beta-readiness")({
  head: () => ({
    meta: [
      { title: "Beta Readiness — EagleBABA" },
      { name: "description", content: "Admin-only Phase 33 beta readiness certification & go-live checklist." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AdminBetaReadinessPage,
});

const STATUS_STYLES: Record<CheckStatus, string> = {
  PASS: "text-emerald-400",
  PARTIAL: "text-amber-300",
  FAIL: "text-red-400",
};

const VERDICT_STYLES: Record<string, string> = {
  BLOCKED: "border-red-500/40 bg-red-500/10 text-red-300",
  READY_FOR_INTERNAL_BETA: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  READY_FOR_CLOSED_BETA: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  READY_FOR_OPEN_BETA: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  READY_FOR_PRODUCTION: "border-emerald-500/40 bg-emerald-500/10 text-emerald-100",
};

function AdminBetaReadinessPage() {
  const { role } = useAuth();
  const report = useMemo(() => defaultVerificationReport(), []);
  const runtimeQuery = useRuntimeReadinessQuery();
  const runtime = runtimeQuery.data ?? null;

  if (role !== "admin") {
    return (
      <div className="min-h-screen bg-background px-4 py-8">
        <div className="mx-auto max-w-2xl rounded-xl border border-red-500/40 bg-red-500/[0.06] p-6 text-sm text-red-300">
          Admin access required.
        </div>
      </div>
    );
  }

  const byCat = new Map<ChecklistCategory, typeof report.items[number][]>();
  for (const item of report.items) {
    const list = byCat.get(item.category) ?? [];
    list.push(item);
    byCat.set(item.category, list);
  }

  return (
    <div className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header>
          <h1 className="text-2xl font-semibold text-foreground">Beta Readiness</h1>
          <p className="text-sm text-muted-foreground">
            Phase 33 · verification & go-live certification. Read-only; never deploys.
          </p>
        </header>
        {runtime && (
          <RuntimeReadinessSummary
            report={runtime}
            title="Canonical Runtime Readiness"
            compact
          />
        )}

        <div className="grid gap-4 md:grid-cols-3">
          <div className={`rounded-xl border p-4 ${VERDICT_STYLES[report.verdict] ?? "border-border bg-muted/20"}`}>
            <p className="text-xs uppercase tracking-wide opacity-80">Final verdict</p>
            <p className="mt-1 text-lg font-semibold">{report.verdict.replace(/_/g, " ")}</p>
            <p className="mt-2 text-xs opacity-70">Manual sign-off required for production.</p>
          </div>
          <div className="rounded-xl border border-border bg-muted/10 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Score</p>
            <p className="mt-1 text-3xl font-bold text-foreground">{report.score}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              ✓ {report.counts.pass} · ⚠ {report.counts.partial} · ✗ {report.counts.fail} / {report.counts.total}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-muted/10 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Blockers</p>
            <p className="mt-1 text-3xl font-bold text-foreground">{report.blockers.length}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Broker execution disabled · no mock data · formulas immutable
            </p>
          </div>
        </div>

        {report.blockers.length > 0 && (
          <section className="rounded-xl border border-red-500/40 bg-red-500/[0.05] p-4">
            <h2 className="text-sm font-semibold text-red-300">Blockers</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-200/90">
              {report.blockers.map((b) => <li key={b}>{b}</li>)}
            </ul>
          </section>
        )}

        <section className="space-y-4">
          {Array.from(byCat.entries()).map(([cat, items]) => (
            <div key={cat} className="rounded-xl border border-border bg-muted/5">
              <div className="flex items-center justify-between border-b border-border/60 px-4 py-2">
                <h3 className="text-sm font-semibold text-foreground">{cat}</h3>
                <span className="text-xs text-muted-foreground">
                  {items.filter((i) => i.status === "PASS").length}✓ ·{" "}
                  {items.filter((i) => i.status === "PARTIAL").length}⚠ ·{" "}
                  {items.filter((i) => i.status === "FAIL").length}✗
                </span>
              </div>
              <ul className="divide-y divide-border/40">
                {items.map((i) => (
                  <li key={i.id} className="flex items-start justify-between gap-4 px-4 py-2 text-sm">
                    <div>
                      <p className="text-foreground">{i.title}</p>
                      {i.detail && <p className="text-xs text-muted-foreground">{i.detail}</p>}
                    </div>
                    <span className={`text-xs font-semibold ${STATUS_STYLES[i.status]}`}>{i.status}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}