import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/status")({
  component: StatusPage,
  head: () => ({
    meta: [
      { title: "System Status | EagleBABA" },
      { name: "description", content: "EagleBABA public system status summary." },
      { property: "og:title", content: "System Status | EagleBABA" },
      { property: "og:description", content: "Public system status summary." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function StatusPage() {
  return (
    <div className="w-full max-w-[1800px] mx-auto px-2 sm:px-4 lg:px-6 py-4 flex flex-col gap-4 overflow-x-hidden">
      <article className="max-w-4xl space-y-6 text-sm leading-relaxed">
        <h1 className="text-2xl font-semibold tracking-tight">System Status</h1>
        <p className="text-muted-foreground">
          Live health, provider status, and readiness details are available to signed-in
          administrators at <code className="rounded bg-muted px-1 py-0.5">/admin/system-status</code>
          . This public page summarises platform posture for RC1.
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Platform: v1.0-RC1 (release candidate)</li>
          <li>Live order execution: disabled</li>
          <li>Broker execution: disabled</li>
          <li>CoinDCX trading: disabled (market data only)</li>
          <li>Billing: manual UPI verification</li>
        </ul>
        <p className="text-xs text-muted-foreground">
          Incidents and provider outages are recorded in observability diagnostics; see admin console
          for details.
        </p>
      </article>
    </div>
  );
}
