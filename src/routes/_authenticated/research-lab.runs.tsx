import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/research-lab/runs")({
  head: () => ({ meta: [{ title: "Research Lab · Runs" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <section aria-labelledby="rn-heading" className="space-y-2">
      <h2 id="rn-heading" className="text-sm font-semibold">Research runs</h2>
      <p className="text-xs text-muted-foreground">Persisted deterministic runs. Compare two runs to inspect deltas.</p>
      <p className="text-xs text-muted-foreground">
        <Link to="/research-lab" className="underline">Back to overview</Link>
      </p>
    </section>
  ),
});