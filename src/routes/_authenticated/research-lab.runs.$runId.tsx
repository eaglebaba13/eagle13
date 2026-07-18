import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/research-lab/runs/$runId")({
  head: () => ({ meta: [{ title: "Research Lab · Run" }, { name: "robots", content: "noindex" }] }),
  component: RunDetail,
});

function RunDetail() {
  const { runId } = Route.useParams();
  return (
    <section aria-labelledby="rd-heading" className="space-y-2">
      <h2 id="rd-heading" className="text-sm font-semibold">Run {runId}</h2>
      <p className="text-xs text-muted-foreground">Manifest, metrics, confusion matrix and warnings for this run.</p>
    </section>
  );
}