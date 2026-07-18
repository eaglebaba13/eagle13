// Phase 3E — Admin diagnostics for the Research Lab.

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/research-lab")({
  head: () => ({
    meta: [
      { title: "Admin · Research Lab" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AdminResearchLabPage,
});

function AdminResearchLabPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-3 p-4 md:p-6">
      <header>
        <h1 className="text-lg font-semibold text-foreground">Research Lab · Admin diagnostics</h1>
        <p className="text-xs text-muted-foreground">
          Read-only. Non-critical module. Leakage detections block research execution only — they never
          affect live-market readiness.
        </p>
      </header>
      <dl className="grid grid-cols-2 gap-2 text-xs md:grid-cols-3">
        <Row k="Dataset availability" v="Depends on caller-provided historical data" />
        <Row k="Persistence" v="In-memory fallback (deterministic)" />
        <Row k="Diagnostics path" v="/admin/research-lab" />
        <Row k="Runtime readiness" v="RESEARCH_LAB (non-critical)" />
        <Row k="Redaction" v="Allowlisted — no credentials, headers, or PII" />
        <Row k="Disclaimer" v="Historical results do not guarantee future performance" />
      </dl>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-background/50 p-2">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</dt>
      <dd className="text-xs text-foreground">{v}</dd>
    </div>
  );
}