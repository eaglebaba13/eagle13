// Phase 2G — Contradiction panel.

import type { Contradiction } from "@/lib/runtime-readiness/contradictions";

export interface RuntimeContradictionPanelProps {
  readonly contradictions: readonly Contradiction[];
}

export function RuntimeContradictionPanel({ contradictions }: RuntimeContradictionPanelProps) {
  if (contradictions.length === 0) return null;
  const hasCritical = contradictions.some((c) => c.severity === "critical");
  const shellCls = hasCritical
    ? "rounded-lg border border-red-500/40 bg-red-500/[0.05] p-4"
    : "rounded-lg border border-amber-500/40 bg-amber-500/[0.05] p-4";
  const heading = hasCritical ? "Contradictions detected" : "Advisories";
  const headingCls = hasCritical
    ? "mb-2 text-sm font-semibold text-red-300"
    : "mb-2 text-sm font-semibold text-amber-300";
  return (
    <section
      aria-label={hasCritical ? "Runtime contradictions" : "Runtime advisories"}
      data-testid="runtime-contradiction-panel"
      className={shellCls}
    >
      <h2 className={headingCls}>{heading}</h2>
      <ul className="space-y-2 text-sm">
        {contradictions.map((c) => (
          <li
            key={c.code}
            data-severity={c.severity}
            className={
              c.severity === "critical"
                ? "rounded border border-red-500/40 bg-red-500/[0.08] p-2 text-red-200"
                : "rounded border border-amber-500/40 bg-amber-500/[0.06] p-2 text-amber-200"
            }
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs">{c.code}</span>
              <span className="text-[11px] uppercase tracking-wide opacity-80">{c.severity}</span>
            </div>
            <div className="mt-1 text-xs">{c.message}</div>
            <div className="mt-1 text-[11px] opacity-80">Modules: {c.modules.join(", ")}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}