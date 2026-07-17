// Phase 2G — Overall runtime readiness summary.

import type { RuntimeReadinessReport } from "@/lib/runtime-readiness/runtime-readiness";
import { RuntimeStatusBadge } from "./RuntimeStatusBadge";
import { RuntimeModuleCard } from "./RuntimeModuleCard";
import { RuntimeContradictionPanel } from "./RuntimeContradictionPanel";

export interface RuntimeReadinessSummaryProps {
  readonly report: RuntimeReadinessReport;
  readonly title?: string;
  readonly compact?: boolean;
}

export function RuntimeReadinessSummary({
  report,
  title = "Runtime Readiness",
  compact = false,
}: RuntimeReadinessSummaryProps) {
  const { overall, provenance, blockers, warnings, contradictions, evidence, generatedAt } = report;
  return (
    <section
      aria-label={title}
      data-testid="runtime-readiness-summary"
      data-overall={overall}
      className="space-y-4 rounded-xl border border-border bg-card/60 p-4"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-[11px] text-muted-foreground">
            Generated {generatedAt} · schema v{report.schemaVersion}
          </p>
        </div>
        <RuntimeStatusBadge
          label={overall.replace(/_/g, " ")}
          tone={overall}
          ariaLabel={`Overall runtime readiness: ${overall}`}
        />
      </header>
      <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
        <Stat label="Modules" value={provenance.modules} />
        <Stat label="Healthy" value={provenance.healthy} tone="ok" />
        <Stat label="Degraded" value={provenance.degraded} tone="warn" />
        <Stat label="Blocked" value={provenance.blocked} tone="err" />
        <Stat label="Demo" value={provenance.demo} tone="info" />
      </dl>
      {(blockers.length > 0 || warnings.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {blockers.length > 0 && (
            <div aria-label="Blockers" className="rounded border border-red-500/30 bg-red-500/[0.05] p-2 text-xs text-red-300">
              <div className="mb-1 font-semibold">Blockers ({blockers.length})</div>
              <ul className="space-y-0.5">
                {blockers.slice(0, 8).map((b, i) => (
                  <li key={i}>• {b}</li>
                ))}
              </ul>
            </div>
          )}
          {warnings.length > 0 && (
            <div aria-label="Warnings" className="rounded border border-amber-500/30 bg-amber-500/[0.05] p-2 text-xs text-amber-300">
              <div className="mb-1 font-semibold">Warnings ({warnings.length})</div>
              <ul className="space-y-0.5">
                {warnings.slice(0, 8).map((w, i) => (
                  <li key={i}>• {w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      <RuntimeContradictionPanel contradictions={contradictions} />
      {!compact && (
        <div className="grid gap-3 md:grid-cols-2">
          {evidence.map((e) => (
            <RuntimeModuleCard key={e.module} evidence={e} />
          ))}
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" | "err" | "info" }) {
  const cls =
    tone === "ok"
      ? "text-emerald-300"
      : tone === "warn"
        ? "text-amber-300"
        : tone === "err"
          ? "text-red-300"
          : tone === "info"
            ? "text-sky-300"
            : "";
  return (
    <div className="rounded border border-border/40 bg-background/40 p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold ${cls}`}>{value}</div>
    </div>
  );
}