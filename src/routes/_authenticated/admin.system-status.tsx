// Phase 31 — Admin System Status console.
//
// Read-only aggregation of pipeline definition, environment status,
// health composer, backup readiness, and security posture. This page
// does NOT trigger deploys; it visualises pre-computed policy.

import { createFileRoute } from "@tanstack/react-router";
import { PRODUCTION_PIPELINE } from "@/lib/ci-cd-pipeline";
import { DEFAULT_ENV_REQUIREMENTS } from "@/lib/env-validation";
import { RECOVERY_CHECKLIST } from "@/lib/backup-recovery";
import { MIGRATION_CHECKLIST, ROLLBACK_CHECKLIST } from "@/lib/release-management";
import { REQUIRED_SECURITY_HEADERS } from "@/lib/security-audit";
import { RuntimeReadinessSummary } from "@/components/runtime-readiness";
import { useRuntimeReadinessQuery } from "@/lib/runtime-readiness/use-runtime-readiness";

export const Route = createFileRoute("/_authenticated/admin/system-status")({
  head: () => ({
    meta: [
      { title: "System Status — EagleBABA" },
      {
        name: "description",
        content:
          "Admin-only deployment, environment, backup and security posture overview for the EagleBABA Astro Research Platform.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: SystemStatusPage,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border/40 bg-card/40 p-5">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function SystemStatusPage() {
  const buildVersion = (import.meta.env.VITE_BUILD_VERSION as string | undefined) ?? "dev";
  const gitCommit = (import.meta.env.VITE_GIT_COMMIT as string | undefined) ?? "local";
  const deployedAt = (import.meta.env.VITE_DEPLOYED_AT as string | undefined) ?? new Date().toISOString();

  const rq = useRuntimeReadinessQuery();
  const report = rq.data ?? null;
  const error = rq.error ? rq.error.message : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">System Status</h1>
        <p className="text-sm text-muted-foreground">
          Phase 31 · deployment framework overview. Research engines, formulas
          and broker paths are intentionally excluded from this surface.
        </p>
      </header>

      {error && (
        <div role="alert" className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          Runtime readiness: {error}
        </div>
      )}
      {report && <RuntimeReadinessSummary report={report} title="Canonical Runtime Readiness" />}

      <Section title="Build Information">
        <dl className="grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Version</dt>
            <dd className="font-mono">{buildVersion}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Git commit</dt>
            <dd className="font-mono">{gitCommit}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Deployed at</dt>
            <dd className="font-mono">{deployedAt}</dd>
          </div>
        </dl>
      </Section>

      <Section title="CI/CD Pipeline">
        <ol className="space-y-1 text-sm">
          {PRODUCTION_PIPELINE.map((s, i) => (
            <li key={s.id} className="flex items-start gap-3">
              <span className="w-6 text-muted-foreground">{i + 1}.</span>
              <div>
                <div className="font-medium">
                  {s.label}
                  {!s.blocking && (
                    <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs">non-blocking</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">{s.description}</div>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Environment Requirements">
        <ul className="grid grid-cols-1 gap-1 text-sm md:grid-cols-2">
          {DEFAULT_ENV_REQUIREMENTS.map((r) => (
            <li key={r.key} className="flex items-baseline justify-between gap-3">
              <span className="font-mono text-xs">{r.key}</span>
              <span className="text-xs text-muted-foreground">
                {r.category}
                {r.required ? " · required" : " · optional"}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Backup & Recovery Checklist">
        <ul className="space-y-1 text-sm">
          {RECOVERY_CHECKLIST.map((c) => (
            <li key={c.id}>
              <span className="font-medium">{c.label}</span>{" "}
              <span className="text-xs text-muted-foreground">— {c.detail}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Release Management">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <h3 className="mb-1 text-sm font-semibold">Migration checklist</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {MIGRATION_CHECKLIST.map((c) => (
                <li key={c.id}>
                  {c.label}
                  {c.required && <span className="ml-2 text-xs text-amber-300">required</span>}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-1 text-sm font-semibold">Rollback checklist</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {ROLLBACK_CHECKLIST.map((c) => (
                <li key={c.id}>
                  {c.label}
                  {c.required && <span className="ml-2 text-xs text-amber-300">required</span>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section title="Security Posture — Required Response Headers">
        <ul className="flex flex-wrap gap-2 text-xs">
          {REQUIRED_SECURITY_HEADERS.map((h) => (
            <li key={h} className="rounded border border-border/40 bg-muted px-2 py-1 font-mono">
              {h}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}