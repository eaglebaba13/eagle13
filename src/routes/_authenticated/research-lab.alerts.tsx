import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/research-lab/alerts")({
  head: () => ({ meta: [{ title: "Research Lab · Smart Alerts" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <section aria-labelledby="al-heading" className="space-y-2">
      <h2 id="al-heading" className="text-sm font-semibold">Smart Alert study</h2>
      <p className="text-xs text-muted-foreground">Historical alert alignment, suppression evidence and readiness blocks.</p>
    </section>
  ),
});