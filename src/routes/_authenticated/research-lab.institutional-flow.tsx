import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/research-lab/institutional-flow")({
  head: () => ({ meta: [{ title: "Research Lab · Institutional Flow" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <section aria-labelledby="if-heading" className="space-y-2">
      <h2 id="if-heading" className="text-sm font-semibold">Institutional Flow study</h2>
      <p className="text-xs text-muted-foreground">Class-conditioned outcomes. Gamma-unavailable periods excluded from Gamma metrics.</p>
    </section>
  ),
});