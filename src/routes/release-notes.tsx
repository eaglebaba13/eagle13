import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/release-notes")({
  component: ReleaseNotesPage,
  head: () => ({
    meta: [
      { title: "Release Notes | EagleBABA" },
      { name: "description", content: "EagleBABA release history and v1.0 candidate summary." },
      { property: "og:title", content: "Release Notes | EagleBABA" },
      { property: "og:description", content: "Release history and v1.0 candidate summary." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function ReleaseNotesPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-6 px-4 py-10 text-sm leading-relaxed">
      <h1 className="text-2xl font-semibold tracking-tight">Release Notes</h1>
      <section className="space-y-2">
        <h2 className="text-lg font-medium">v1.0-RC1 — Release Candidate</h2>
        <ul className="list-disc space-y-1 pl-6">
          <li>Application shell, sidebar, breadcrumbs and responsive drawer</li>
          <li>Provider label sanitization and live data wiring for Options, PCR, Decision Engine</li>
          <li>Gann Square next-day gap outlook with outcome tracking</li>
          <li>Professional Option Strategy Terminal (VIX-aware, deterministic)</li>
          <li>AI Market Assistant (template-based, guardrailed)</li>
          <li>Smart Alert Engine with persistence and admin readiness</li>
          <li>Institutional Flow dashboard (OI / max-pain / GEX)</li>
          <li>Research Lab and Backtest Lab (research-only)</li>
          <li>CoinDCX market-data integration (execution disabled)</li>
          <li>Release checklist, legal pages, health &amp; environment validators</li>
        </ul>
        <p className="text-muted-foreground">Live order execution remains disabled by platform flags. Billing is manual UPI verification.</p>
      </section>
    </article>
  );
}