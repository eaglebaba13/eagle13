// Phase 2G — Runtime module detail card.

import type { RuntimeEvidence } from "@/lib/runtime-readiness/runtime-evidence";
import { RuntimeStatusBadge } from "./RuntimeStatusBadge";

export interface RuntimeModuleCardProps {
  readonly evidence: RuntimeEvidence;
}

export function RuntimeModuleCard({ evidence: e }: RuntimeModuleCardProps) {
  return (
    <article
      aria-label={`${e.module} module`}
      data-testid="runtime-module-card"
      data-module={e.module}
      className="rounded-lg border border-border/50 bg-card/50 p-4 text-sm"
    >
      <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{e.module.replace(/_/g, " ")}</h3>
        <div className="flex flex-wrap gap-1.5">
          <RuntimeStatusBadge label={e.status} tone={e.status} source={e.source} />
          <RuntimeStatusBadge label={e.readiness} tone={e.readiness} />
        </div>
      </header>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <div className="text-muted-foreground">Capability</div>
        <div className="font-mono">{e.capability}</div>
        <div className="text-muted-foreground">Freshness</div>
        <div>{e.freshness}</div>
        <div className="text-muted-foreground">Quality</div>
        <div>{e.quality}</div>
        <div className="text-muted-foreground">Latency</div>
        <div>{e.latencyMs != null ? `${e.latencyMs} ms` : "—"}</div>
        <div className="text-muted-foreground">Observed</div>
        <div className="font-mono">{e.observedAt}</div>
        <div className="text-muted-foreground">Provenance</div>
        <div>{e.provenance}</div>
      </dl>
      <p className="mt-2 text-xs">{e.reason}</p>
      {e.blockers.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-red-300" aria-label="Blockers">
          {e.blockers.map((b, i) => (
            <li key={i}>• {b}</li>
          ))}
        </ul>
      )}
      {e.warnings.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-xs text-amber-300" aria-label="Warnings">
          {e.warnings.map((w, i) => (
            <li key={i}>• {w}</li>
          ))}
        </ul>
      )}
      {e.diagnosticsPath && (
        <a href={e.diagnosticsPath} className="mt-2 inline-block text-xs text-primary underline">
          Open diagnostics →
        </a>
      )}
    </article>
  );
}