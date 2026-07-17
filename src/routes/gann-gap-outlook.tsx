// Phase 2I-B — Gann Gap Outlook detail route (research-only).

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getGannGapOutlook } from "@/lib/gann-gap/gann-gap.functions";
import {
  GANN_GAP_DISCLAIMER,
  type GannGapOutlookLabel,
} from "@/lib/gann-gap/types";
import { GANN_GAP_FORMULA_VERSION, GANN_GAP_CONFIG_VERSION } from "@/lib/gann-gap/formula-version";

export const Route = createFileRoute("/gann-gap-outlook")({
  head: () => ({
    meta: [
      { title: "Gann Gap Outlook — Research Only" },
      {
        name: "description",
        content:
          "Deterministic Gann Square next-day gap outlook. Research only — never places a broker order.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: GannGapOutlookPage,
});

const LABEL_TEXT: Record<GannGapOutlookLabel, string> = {
  PENDING: "Waiting for 15:26 IST",
  GAP_UP_RESEARCH: "Gap Up (Research)",
  GAP_DOWN_RESEARCH: "Gap Down (Research)",
  INDECISION: "Indecision",
  NO_VALID_SETUP: "No Valid Setup",
  DATA_UNAVAILABLE: "Data Unavailable",
};

function GannGapOutlookPage() {
  const fetchOutlook = useServerFn(getGannGapOutlook);
  const { data, error, isLoading } = useQuery({
    queryKey: ["gann-gap-outlook"],
    queryFn: () => fetchOutlook(),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
  });

  return (
    <div className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <header>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-foreground">Gann Gap Outlook</h1>
            <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-sky-300">
              Research Only
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Deterministic Gann Square gap outlook for the next trading session.
            {" "}
            {GANN_GAP_DISCLAIMER}
          </p>
        </header>

        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {error && (
          <div role="alert" className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
            {(error as Error).message}
          </div>
        )}

        {data && !data.featureEnabled && (
          <div className="rounded-md border border-border bg-muted/10 p-4 text-sm text-muted-foreground">
            Feature is currently disabled. Enable <code>gann.gap.outlook</code> in feature flags to run the classifier.
          </div>
        )}

        {data && data.featureEnabled && (
          <>
            <section className="rounded-xl border border-border bg-card/60 p-4">
              <h2 className="text-sm font-semibold">Current Outlook</h2>
              <p className="mt-2 text-lg font-semibold">{LABEL_TEXT[data.label]}</p>
              <p className="mt-1 text-xs text-muted-foreground">Lifecycle: {data.lifecycle} · For session {data.nextTradingDate || "—"}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Source:{" "}
                <span className="font-medium text-foreground">{data.source}</span>
              </p>
              {data.reference != null && (
                <p className="mt-1 text-xs text-muted-foreground">Reference NIFTY: {data.reference.toFixed(2)}</p>
              )}
              {data.confidence && (
                <p className="mt-1 text-xs text-muted-foreground">Confidence band: {data.confidence}</p>
              )}
              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                {data.reasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </section>

            {data.levels.length > 0 && (
              <section className="rounded-xl border border-border bg-card/60 p-4">
                <h2 className="text-sm font-semibold">Levels</h2>
                <div className="mt-2 overflow-x-auto">
                  <table className="min-w-full text-left text-xs">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th className="px-2 py-1">n</th>
                        <th className="px-2 py-1">n²</th>
                        <th className="px-2 py-1">Level</th>
                        <th className="px-2 py-1">Distance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.levels.map((l) => (
                        <tr key={l.n} className="border-t border-border/60">
                          <td className="px-2 py-1">{l.n}</td>
                          <td className="px-2 py-1">{l.squareBase}</td>
                          <td className="px-2 py-1 font-medium text-foreground">{l.level}</td>
                          <td className="px-2 py-1">{l.distance.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {data.zone && (
              <section className="rounded-xl border border-border bg-card/60 p-4">
                <h2 className="text-sm font-semibold">Closing Zone</h2>
                <dl className="mt-2 grid gap-1 text-xs">
                  <div><dt className="inline text-muted-foreground">Reference: </dt><dd className="inline font-medium text-foreground">{data.zone.reference.toFixed(2)}</dd></div>
                  <div><dt className="inline text-muted-foreground">Nearest below: </dt><dd className="inline font-medium text-foreground">{data.zone.nearestBelow?.level ?? "—"}</dd></div>
                  <div><dt className="inline text-muted-foreground">Nearest above: </dt><dd className="inline font-medium text-foreground">{data.zone.nearestAbove?.level ?? "—"}</dd></div>
                  <div><dt className="inline text-muted-foreground">Inside indecision band: </dt><dd className="inline font-medium text-foreground">{String(data.zone.insideIndecisionBand)}</dd></div>
                  <div><dt className="inline text-muted-foreground">Reclaimed above: </dt><dd className="inline font-medium text-foreground">{String(data.zone.reclaimedAbove)}</dd></div>
                  <div><dt className="inline text-muted-foreground">Rejected below: </dt><dd className="inline font-medium text-foreground">{String(data.zone.rejectedBelow)}</dd></div>
                </dl>
              </section>
            )}

            <section className="rounded-xl border border-border bg-card/60 p-4">
              <h2 className="text-sm font-semibold">Confirmations</h2>
              <ul className="mt-2 divide-y divide-border/40 text-xs">
                {data.confirmations.map((c) => (
                  <li key={c.id} className="flex items-start justify-between gap-4 py-1.5">
                    <div>
                      <p className="font-medium text-foreground">{c.label}</p>
                      <p className="text-muted-foreground">{c.detail}</p>
                    </div>
                    <span className="text-muted-foreground">{c.alignment}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-xl border border-border bg-card/60 p-4">
              <h2 className="text-sm font-semibold">Methodology & Version</h2>
              <dl className="mt-2 grid gap-1 text-xs text-muted-foreground">
                <div><dt className="inline">Formula: </dt><dd className="inline font-medium text-foreground">{GANN_GAP_FORMULA_VERSION}</dd></div>
                <div><dt className="inline">Config: </dt><dd className="inline font-medium text-foreground">{GANN_GAP_CONFIG_VERSION}</dd></div>
                <div><dt className="inline">Source: </dt><dd className="inline font-medium text-foreground">{data.source}</dd></div>
                <div><dt className="inline">Observed at: </dt><dd className="inline font-medium text-foreground">{data.observedAt}</dd></div>
              </dl>
              <p className="mt-3 text-[11px] text-muted-foreground/80">
                Level formula: level = n². If n² is even, add +1. Examples: 149→22201, 150→22501, 151→22801, 152→23105.
                Classifier bands and confirmations are documented in <code>src/lib/gann-gap/</code>.
              </p>
            </section>

            <p className="text-[11px] text-muted-foreground/80">{GANN_GAP_DISCLAIMER}</p>
          </>
        )}
      </div>
    </div>
  );
}