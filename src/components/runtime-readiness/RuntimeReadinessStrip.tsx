// Phase 2H — Compact runtime-readiness strip for dashboard-style surfaces.
//
// Consumes the canonical `RuntimeReadinessReport` and renders a single
// horizontal row of counters + overall verdict + diagnostics deep-link.
// No provider fetches, no formula logic. Safe to embed anywhere the
// canonical report is already available or reachable via
// `useRuntimeReadinessQuery`.

import type { RuntimeReadinessReport } from "@/lib/runtime-readiness/runtime-readiness";
import { RuntimeStatusBadge } from "./RuntimeStatusBadge";

export interface RuntimeReadinessStripProps {
  readonly report: RuntimeReadinessReport;
  readonly diagnosticsHref?: string;
  readonly title?: string;
}

export function RuntimeReadinessStrip({
  report,
  diagnosticsHref = "/admin/system-status",
  title = "Runtime Readiness",
}: RuntimeReadinessStripProps) {
  const { overall, provenance, blockers, warnings, contradictions, generatedAt } = report;
  return (
    <section
      aria-label={title}
      data-testid="runtime-readiness-strip"
      data-overall={overall}
      className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-card/50 px-3 py-2 text-xs"
    >
      <div className="flex items-center gap-2">
        <span className="font-semibold uppercase tracking-wide text-[10px] text-muted-foreground">
          {title}
        </span>
        <RuntimeStatusBadge
          label={overall.replace(/_/g, " ")}
          tone={overall}
          ariaLabel={`Overall runtime readiness: ${overall}`}
        />
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]" aria-label="Runtime counters">
        <Chip label="Live" value={provenance.healthy} tone="ok" />
        <Chip label="Degraded" value={provenance.degraded} tone="warn" />
        <Chip label="Blocked" value={provenance.blocked} tone="err" />
        <Chip label="Demo" value={provenance.demo} tone="info" />
        <Chip label="Blockers" value={blockers.length} tone={blockers.length ? "err" : "muted"} />
        <Chip label="Warnings" value={warnings.length} tone={warnings.length ? "warn" : "muted"} />
        <Chip
          label="Contradictions"
          value={contradictions.length}
          tone={contradictions.length ? "err" : "muted"}
        />
      </ul>
      <div className="ml-auto flex items-center gap-2 text-[10px] text-muted-foreground">
        <time dateTime={generatedAt} className="font-mono">
          {generatedAt}
        </time>
        <a href={diagnosticsHref} className="text-primary underline">
          Diagnostics →
        </a>
      </div>
    </section>
  );
}

function Chip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "ok" | "warn" | "err" | "info" | "muted";
}) {
  const cls =
    tone === "ok"
      ? "text-emerald-300"
      : tone === "warn"
        ? "text-amber-300"
        : tone === "err"
          ? "text-red-300"
          : tone === "info"
            ? "text-sky-300"
            : "text-muted-foreground";
  return (
    <li className="inline-flex items-center gap-1">
      <span className="uppercase tracking-wide text-[9px] text-muted-foreground">{label}</span>
      <span className={`font-mono font-semibold ${cls}`}>{value}</span>
    </li>
  );
}

export interface RuntimeReadinessStripFallbackProps {
  readonly reason: string;
  readonly diagnosticsHref?: string;
}

export function RuntimeReadinessStripFallback({
  reason,
  diagnosticsHref = "/admin/system-status",
}: RuntimeReadinessStripFallbackProps) {
  return (
    <section
      aria-label="Runtime Readiness"
      data-testid="runtime-readiness-strip-fallback"
      role="status"
      className="flex flex-wrap items-center gap-3 rounded-lg border border-border/50 bg-card/40 px-3 py-2 text-xs text-muted-foreground"
    >
      <span className="font-semibold uppercase tracking-wide text-[10px]">Runtime Readiness</span>
      <RuntimeStatusBadge label="UNAVAILABLE" tone="UNAVAILABLE" />
      <span className="text-[11px]">{reason}</span>
      <a href={diagnosticsHref} className="ml-auto text-primary underline text-[10px]">
        Diagnostics →
      </a>
    </section>
  );
}