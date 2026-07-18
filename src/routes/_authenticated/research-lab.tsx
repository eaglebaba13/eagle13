// Phase 3E — Research Lab main route.
// Research-only. No live orders, no formulas modified.

import { createFileRoute, Link, Outlet, useMatches } from "@tanstack/react-router";
import { RESEARCH_LAB_DISCLAIMER } from "@/lib/research-lab";

export const Route = createFileRoute("/_authenticated/research-lab")({
  head: () => ({
    meta: [
      { title: "Research Lab — Historical Signal Validation · EagleBABA" },
      { name: "description", content: "Historical research and signal-validation lab. Research only — historical results do not guarantee future performance." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResearchLabLayout,
});

const tabs = [
  { to: "/research-lab", label: "Overview", exact: true },
  { to: "/research-lab/gann-gap", label: "Gann Gap" },
  { to: "/research-lab/signals", label: "Signals" },
  { to: "/research-lab/alerts", label: "Smart Alerts" },
  { to: "/research-lab/institutional-flow", label: "Institutional Flow" },
  { to: "/research-lab/runs", label: "Runs" },
] as const;

function ResearchLabLayout() {
  const matches = useMatches();
  const current = matches[matches.length - 1]?.pathname ?? "/research-lab";
  const showOverview = current === "/research-lab" || current === "/research-lab/";
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <header>
        <div className="text-xs uppercase tracking-wide text-muted-foreground">RESEARCH LAB · HISTORICAL VALIDATION</div>
        <h1 className="text-xl font-semibold text-foreground">Historical Research &amp; Signal Validation Lab</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Consumes canonical signals only. Deterministic. No live orders. No trading formulas modified.
        </p>
      </header>
      <nav aria-label="Research studies" className="flex flex-wrap gap-2 border-b border-border/60 pb-2 text-xs">
        {tabs.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            className="rounded-md border border-border/60 px-3 py-1 text-muted-foreground hover:bg-accent/40"
            activeProps={{ className: "rounded-md border border-border/60 px-3 py-1 bg-accent/60 text-foreground" }}
            activeOptions={{ exact: !!("exact" in t && t.exact) }}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <div role="note" className="rounded-md border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
        {RESEARCH_LAB_DISCLAIMER}
      </div>
      {showOverview ? <Overview /> : <Outlet />}
    </div>
  );
}

function Overview() {
  return (
    <section className="grid gap-3 md:grid-cols-2">
      <Card title="Dataset status">
        <p className="text-xs text-muted-foreground">
          No dataset loaded in this session. Datasets are supplied by canonical
          historical exports and hashed for determinism. Loading data from a
          browser-side provider is not permitted.
        </p>
      </Card>
      <Card title="Studies available">
        <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">
          <li>Gann Gap historical validation (as implemented; not re-tuned).</li>
          <li>Signal family metrics (Decision, GTI, PCR, Breadth, Institutional Flow).</li>
          <li>Smart Alert alignment &amp; suppression.</li>
          <li>Institutional Flow class-conditioned outcomes.</li>
          <li>Walk-forward chronological splits.</li>
        </ul>
      </Card>
      <Card title="Warnings">
        <p className="text-xs text-muted-foreground">None until a dataset is loaded.</p>
      </Card>
      <Card title="Recent runs">
        <p className="text-xs text-muted-foreground">
          <Link to="/research-lab/runs" className="underline">View runs</Link>
        </p>
      </Card>
    </section>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border/60 bg-background/50 p-3">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <div className="mt-2">{children}</div>
    </div>
  );
}
