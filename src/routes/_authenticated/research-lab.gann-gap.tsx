import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/research-lab/gann-gap")({
  head: () => ({ meta: [{ title: "Research Lab · Gann Gap" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <section aria-labelledby="gg-heading" className="space-y-2">
      <h2 id="gg-heading" className="text-sm font-semibold">Gann Gap historical study</h2>
      <p className="text-xs text-muted-foreground">
        Evaluates the Gann Gap outlook exactly as implemented. Confusion matrix and
        precision/recall are computed after a dataset is loaded.
      </p>
    </section>
  ),
});