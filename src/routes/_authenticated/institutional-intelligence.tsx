// Phase 44C — Institutional Market Intelligence dashboard (additive).
// Uses design-system tokens only. No hardcoded colors.
import { createFileRoute } from "@tanstack/react-router";
import { Activity } from "lucide-react";

export const Route = createFileRoute("/_authenticated/institutional-intelligence")({
  head: () => ({
    meta: [
      { title: "Institutional Intelligence · EagleBABA" },
      {
        name: "description",
        content:
          "Aggregated institutional market intelligence: FII/DII flow, macro dashboard, global markets, sector rotation, news and probability engine.",
      },
    ],
  }),
  component: InstitutionalIntelligencePage,
});

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-lg border border-border/60 p-4">
      <h2 id={id} className="text-sm font-semibold text-foreground">{title}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{children}</p>
    </section>
  );
}

function InstitutionalIntelligencePage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
          <Activity size={20} aria-hidden /> Institutional Intelligence
        </h1>
        <p className="text-sm text-muted-foreground">
          Aggregated institutional context: FII/DII, macro, global markets, sector rotation, news and a probability layer.
          Analytical only — does not replace the Decision Engine.
        </p>
      </header>

      <Section id="sec-flow" title="Institutional Flow (FII / DII)">
        Official values only. When the provider is unavailable this section is marked UNAVAILABLE — never estimated.
      </Section>
      <Section id="sec-macro" title="Macro Dashboard">
        USD/INR · DXY · US10Y · Crude · Natural Gas · Gold · Silver. Macro risk is classified LOW / MEDIUM / HIGH.
      </Section>
      <Section id="sec-global" title="Global Markets">
        GIFT NIFTY · Nikkei · Hang Seng · Shanghai · FTSE · DAX · CAC · Dow / Nasdaq / S&P futures.
      </Section>
      <Section id="sec-sector" title="Sector Dashboard">
        Top 3 strongest and weakest sectors with a rotation score.
      </Section>
      <Section id="sec-news" title="Latest News">
        Normalized to sentiment and impact. No fabricated headlines — provider outages surface as UNAVAILABLE.
      </Section>
      <Section id="sec-prob" title="Institutional Probability">
        Independent analytical layer combining FII/DII, macro, sector rotation, global markets, VIX, breadth, PCR and news.
      </Section>
      <Section id="sec-fresh" title="Freshness Monitor">
        Every section exposes LIVE / FRESH / STALE / PARTIAL / UNAVAILABLE. Stale data is never labelled LIVE.
      </Section>
    </div>
  );
}