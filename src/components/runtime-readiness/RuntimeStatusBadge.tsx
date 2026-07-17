// Phase 2G — Canonical status badge.

import type { ModuleStatus, ModuleReadiness, ModuleSource } from "@/lib/runtime-readiness/runtime-evidence";

const STATUS_TONE: Record<string, string> = {
  // Use both light and dark tone variants so text stays WCAG-legible in both themes.
  HEALTHY: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
  DEGRADED: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40",
  BLOCKED: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/40",
  UNAVAILABLE: "bg-red-500/10 text-red-700 dark:text-red-200 border-red-500/30",
  DEMO: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/40",
  UNKNOWN: "bg-muted text-muted-foreground border-border/60",
  READY: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
  PARTIALLY_READY: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40",
  NOT_READY: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/40",
  NOT_APPLICABLE: "bg-muted text-muted-foreground border-border/60",
};

const SOURCE_LABEL: Record<ModuleSource, string> = {
  LIVE: "Live",
  MIXED: "Mixed",
  RESEARCH_DEMO: "Research Demo",
  CONFIGURATION: "Configured",
  STATIC: "Static",
  UNKNOWN: "Unknown",
};

export interface RuntimeStatusBadgeProps {
  readonly label: string;
  readonly tone: ModuleStatus | ModuleReadiness | "READY" | "PARTIALLY_READY" | "NOT_READY";
  readonly source?: ModuleSource;
  readonly ariaLabel?: string;
  readonly title?: string;
}

export function RuntimeStatusBadge({ label, tone, source, ariaLabel, title }: RuntimeStatusBadgeProps) {
  const cls = STATUS_TONE[tone] ?? STATUS_TONE.UNKNOWN;
  return (
    <span
      role="status"
      aria-label={ariaLabel ?? `${label}${source ? ` — ${SOURCE_LABEL[source]}` : ""}`}
      title={title}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}
      data-testid="runtime-status-badge"
      data-tone={tone}
      data-source={source ?? ""}
    >
      <span className="sr-only">Runtime status:</span>
      <span>{label}</span>
      {source && <span className="text-[10px] font-normal opacity-80">· {SOURCE_LABEL[source]}</span>}
    </span>
  );
}

export function sourceLabel(source: ModuleSource): string {
  return SOURCE_LABEL[source];
}