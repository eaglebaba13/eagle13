import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  component: TermsPage,
  head: () => ({
    meta: [
      { title: "Terms of Use | EagleBABA" },
      { name: "description", content: "Terms of use for EagleBABA — a research and analytics platform. No trading execution, no financial advice." },
      { property: "og:title", content: "Terms of Use | EagleBABA" },
      { property: "og:description", content: "Research and analytics platform terms; no financial advice, no execution." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-6 px-4 py-10 text-sm leading-relaxed">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Terms of Use</h1>
        <p className="text-muted-foreground">Last updated: v1.0-RC1.</p>
      </header>
      <section className="space-y-2">
        <h2 className="text-lg font-medium">Research platform</h2>
        <p>EagleBABA is a research and analytics platform. It does not provide investment advice, portfolio management, or trade execution. All levels, signals, and backtests are informational and historical.</p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-medium">No guarantee</h2>
        <p>Historical performance shown in Research Lab or Backtest Lab does not guarantee future results. Markets carry material risk of loss.</p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-medium">Acceptable use</h2>
        <p>You will not attempt to circumvent the platform&#39;s rate limits, scrape provider data at scale, or use the service to make automated trading decisions without independent risk controls.</p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-medium">Billing</h2>
        <p>Paid plans in RC1 are activated via manual UPI verification. See <a className="underline" href="/pricing">pricing</a>.</p>
      </section>
    </article>
  );
}