// Phase 2H — Diagnostics panel: safe JSON export of the canonical
// runtime readiness report. No secrets, no provider URLs, no tokens —
// only the already-public `RuntimeReadinessReport` produced by the
// canonical aggregator.

import { useMemo, useState } from "react";
import type { RuntimeReadinessReport } from "@/lib/runtime-readiness/runtime-readiness";
import {
  redactRuntimeReadinessReport,
  exportRuntimeReadinessJson,
} from "@/lib/runtime-readiness/diagnostics-export";

export interface RuntimeReadinessDiagnosticsProps {
  readonly report: RuntimeReadinessReport | null;
  readonly error?: string | null;
  readonly onRefresh?: () => void;
}

export function RuntimeReadinessDiagnostics({
  report,
  error,
  onRefresh,
}: RuntimeReadinessDiagnosticsProps) {
  const [copied, setCopied] = useState(false);
  const redacted = useMemo(
    () => (report ? redactRuntimeReadinessReport(report) : null),
    [report],
  );
  const json = useMemo(
    () => (redacted ? exportRuntimeReadinessJson(redacted) : ""),
    [redacted],
  );

  const copy = async () => {
    if (!json) return;
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const download = () => {
    if (!json) return;
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `runtime-readiness-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section
      aria-label="Runtime Evidence"
      data-testid="runtime-readiness-diagnostics"
      className="rounded-lg border border-border/60 bg-card/40 p-4 text-xs"
    >
      <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Runtime Evidence</h2>
          <p className="text-[11px] text-muted-foreground">
            Canonical, redacted report — no secrets, no provider URLs.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="rounded border border-border px-2 py-1 text-[11px]"
            >
              Refresh
            </button>
          )}
          <button
            type="button"
            onClick={copy}
            disabled={!json}
            className="rounded border border-border px-2 py-1 text-[11px] disabled:opacity-40"
          >
            {copied ? "Copied ✓" : "Copy JSON"}
          </button>
          <button
            type="button"
            onClick={download}
            disabled={!json}
            className="rounded border border-border px-2 py-1 text-[11px] disabled:opacity-40"
          >
            Download JSON
          </button>
          <a
            href="/admin/system-status"
            className="rounded border border-border px-2 py-1 text-[11px] text-primary underline"
          >
            Deep link →
          </a>
        </div>
      </header>
      {error && (
        <div role="alert" className="mb-2 rounded border border-red-500/30 bg-red-500/10 p-2 text-red-300">
          {error}
        </div>
      )}
      {redacted ? (
        <>
          <dl className="mb-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] sm:grid-cols-4">
            <div className="text-muted-foreground">Schema</div>
            <div className="font-mono">v{redacted.schemaVersion}</div>
            <div className="text-muted-foreground">Generated</div>
            <div className="font-mono">{redacted.generatedAt}</div>
            <div className="text-muted-foreground">Overall</div>
            <div className="font-mono">{redacted.overall}</div>
            <div className="text-muted-foreground">Modules</div>
            <div className="font-mono">{redacted.provenance.modules}</div>
          </dl>
          <pre
            data-testid="runtime-readiness-json"
            className="max-h-96 overflow-auto rounded bg-background/60 p-2 font-mono text-[10px] leading-4"
          >
            {json}
          </pre>
        </>
      ) : (
        <div className="text-muted-foreground">No runtime evidence available.</div>
      )}
    </section>
  );
}