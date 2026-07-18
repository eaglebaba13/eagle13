import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/research-lab/signals")({
  head: () => ({ meta: [{ title: "Research Lab · Signals" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <section aria-labelledby="sig-heading" className="space-y-2">
      <h2 id="sig-heading" className="text-sm font-semibold">Signal validation</h2>
      <p className="text-xs text-muted-foreground">Filter by family, formula version, availability and minimum sample size.</p>
    </section>
  ),
});