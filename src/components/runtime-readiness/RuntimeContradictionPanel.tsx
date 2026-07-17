// Phase 2G — Contradiction panel.

import type { Contradiction } from "@/lib/runtime-readiness/contradictions";

export interface RuntimeContradictionPanelProps {
  readonly contradictions: readonly Contradiction[];
}

export function RuntimeContradictionPanel({ contradictions }: RuntimeContradictionPanelProps) {
  if (contradictions.length === 0) return null;
  return (
    <section
      aria-label="Runtime contradictions"
      data-testid="runtime-contradiction-panel"
      className="rounded-lg border border-red-500/40 bg-red-500/[0.05] p-4"
    >
      <h2 className="mb-2 text-sm font-semibold text-red-300">Contradictions detected</h2>
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