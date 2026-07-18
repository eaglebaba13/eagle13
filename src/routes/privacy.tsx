import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
  head: () => ({
    meta: [
      { title: "Privacy Policy | EagleBABA" },
      { name: "description", content: "How EagleBABA handles account, usage and diagnostic data. Research platform only — no trade execution." },
      { property: "og:title", content: "Privacy Policy | EagleBABA" },
      { property: "og:description", content: "Account, usage and diagnostic data handling for EagleBABA." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-6 px-4 py-10 text-sm leading-relaxed">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Privacy Policy</h1>
        <p className="text-muted-foreground">Last updated: v1.0-RC1.</p>
      </header>
      <section className="space-y-2">
        <h2 className="text-lg font-medium">What we store</h2>
        <p>Account identity supplied at sign-in, saved dashboard layouts, watchlists, alert subscriptions, journal entries, and diagnostic events required to operate the platform.</p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-medium">What we do not store</h2>
        <p>We do not store brokerage credentials in the client, and EagleBABA does not execute live orders. Payment verification is manual UPI at this time; we do not store card numbers or bank details.</p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-medium">Data sharing</h2>
        <p>Market-data providers (Upstox, CoinDCX public endpoints) receive the market symbols required to serve requests. No user identity is forwarded to those providers.</p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-medium">Retention &amp; deletion</h2>
        <p>Account deletion removes user-owned rows (layouts, alerts, journal, run history) under RLS. Aggregate, non-identifying diagnostics may be retained for reliability.</p>
      </section>
    </article>
  );
}