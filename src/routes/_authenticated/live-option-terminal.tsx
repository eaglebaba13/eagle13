// Phase 3A — Live Option Strategy Terminal (research-only, consumer module).
// Never places a broker order. Never modifies canonical formulas.

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getOptionStrategyTerminal } from "@/lib/option-strategy-terminal/terminal.functions";
import type { ScoredStrategy, CanonicalBias } from "@/lib/option-strategy-terminal";
import { describeVixRegime } from "@/lib/option-strategy-terminal";

export const Route = createFileRoute("/_authenticated/live-option-terminal")({
  head: () => ({
    meta: [
      { title: "Live Option Strategy Terminal — EagleBABA" },
      {
        name: "description",
        content:
          "Research-only options workstation. Consolidates Decision, PCR, GTI, Breadth, Astro and Gap Outlook into a ranked strategy view.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: LiveOptionTerminalPage,
});

const BIAS_COLOR: Record<CanonicalBias, string> = {
  BULLISH: "text-[var(--eb-bull)]",
  BEARISH: "text-[var(--eb-bear)]",
  NEUTRAL: "text-[var(--eb-muted)]",
  CONFLICT: "text-[var(--eb-warn,#eab308)]",
  UNAVAILABLE: "text-[var(--eb-muted)] opacity-70",
};

function BiasChip({ bias }: { bias: CanonicalBias }) {
  return (
    <span
      className={`rounded-md border border-[var(--eb-border)] px-2 py-0.5 text-xs font-medium ${BIAS_COLOR[bias]}`}
    >
      {bias}
    </span>
  );
}

function StrategyCard({ s }: { s: ScoredStrategy }) {
  return (
    <div className="rounded-lg border border-[var(--eb-border)] bg-[var(--eb-card)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[var(--eb-text)]">
            {s.profile.label}
          </div>
          <div className="text-xs text-[var(--eb-muted)]">
            {s.profile.legs}-leg · {s.profile.complexity} · Risk {s.profile.risk} · Reward {s.profile.reward}
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold text-[var(--eb-accent)]">
            {s.overallPct}%
          </div>
          <div className="text-[10px] uppercase tracking-wide text-[var(--eb-muted)]">
            alignment {s.alignmentPct}%
          </div>
        </div>
      </div>
      <p className="mt-2 text-xs text-[var(--eb-muted)]">{s.profile.summary}</p>
      {s.rationale.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-[var(--eb-text)]">
          {s.rationale.map((r, i) => (
            <li key={i}>• {r}</li>
          ))}
        </ul>
      )}
      {s.warnings.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-[var(--eb-warn,#eab308)]">
          {s.warnings.map((w, i) => (
            <li key={i}>⚠ {w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LiveOptionTerminalPage() {
  const fetchTerm = useServerFn(getOptionStrategyTerminal);
  const { data, error, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["option-strategy-terminal"],
    queryFn: () => fetchTerm(),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-[var(--eb-text)]">
          Live Option Strategy Terminal
        </h1>
        <p className="text-sm text-[var(--eb-muted)]">
          Research-only workstation. Never places orders. Consumes canonical modules only.
        </p>
      </header>

      {isLoading && (
        <div className="rounded-lg border border-[var(--eb-border)] bg-[var(--eb-card)] p-6 text-sm text-[var(--eb-muted)]">
          Loading canonical signals…
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-[var(--eb-bear)]/40 bg-[var(--eb-card)] p-4 text-sm text-[var(--eb-bear)]">
          Unable to load terminal: {(error as Error).message}
          <button
            className="ml-3 rounded border border-[var(--eb-border)] px-2 py-0.5 text-xs"
            onClick={() => refetch()}
          >
            Retry
          </button>
        </div>
      )}

      {data && (
        <>
          <section className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-[var(--eb-border)] bg-[var(--eb-card)] p-4">
              <div className="text-[10px] uppercase tracking-wide text-[var(--eb-muted)]">
                Consensus Direction
              </div>
              <div className="mt-1 flex items-center gap-2">
                <BiasChip bias={data.engine.direction.bias} />
                <span className="text-sm text-[var(--eb-muted)]">
                  {data.engine.direction.confidence}% conf.
                </span>
              </div>
              <div className="mt-1 text-xs text-[var(--eb-muted)]">
                {data.engine.direction.bullCount} bull ·{" "}
                {data.engine.direction.bearCount} bear ·{" "}
                {data.engine.direction.neutralCount} neutral ·{" "}
                {data.engine.direction.conflictCount} conflict ·{" "}
                {data.engine.direction.unavailableCount} n/a
              </div>
            </div>
            <div className="rounded-lg border border-[var(--eb-border)] bg-[var(--eb-card)] p-4">
              <div className="text-[10px] uppercase tracking-wide text-[var(--eb-muted)]">
                India VIX
              </div>
              <div className="mt-1 text-lg font-semibold text-[var(--eb-text)]">
                {data.engine.vix != null ? data.engine.vix.toFixed(2) : "—"}
              </div>
              <div className="text-xs text-[var(--eb-muted)]">
                Regime {data.engine.vixRegime}
              </div>
            </div>
            <div className="rounded-lg border border-[var(--eb-border)] bg-[var(--eb-card)] p-4">
              <div className="text-[10px] uppercase tracking-wide text-[var(--eb-muted)]">
                Strike Regime
              </div>
              <div className="mt-1 text-lg font-semibold text-[var(--eb-accent)]">
                {data.engine.strikeRegime}
              </div>
              <div className="text-xs text-[var(--eb-muted)]">
                {describeVixRegime(data.engine.vixRegime)}
              </div>
            </div>
            <div className="rounded-lg border border-[var(--eb-border)] bg-[var(--eb-card)] p-4">
              <div className="text-[10px] uppercase tracking-wide text-[var(--eb-muted)]">
                Data Source
              </div>
              <div className="mt-1 text-lg font-semibold text-[var(--eb-text)]">
                {data.source}
              </div>
              <button
                className="mt-2 rounded border border-[var(--eb-border)] px-2 py-0.5 text-xs text-[var(--eb-muted)]"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                {isFetching ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </section>

          <section className="rounded-lg border border-[var(--eb-border)] bg-[var(--eb-card)] p-4">
            <h2 className="text-sm font-semibold text-[var(--eb-text)]">
              Canonical Signals
            </h2>
            <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 md:grid-cols-4">
              {[
                ["Decision", data.signals.decision, data.evidence.decision.action],
                ["PCR", data.signals.pcr, data.evidence.pcr.direction],
                ["GTI", data.signals.gti, data.evidence.gti.state],
                ["Breadth", data.signals.breadth, data.evidence.breadth.state],
                ["Astro", data.signals.astro, "—"],
                ["Gann", data.signals.gann, "—"],
                ["Gap Outlook", data.signals.gannGap, data.evidence.gannGap.label],
              ].map(([label, bias, detail]) => (
                <div key={String(label)} className="flex items-center justify-between gap-2 rounded border border-[var(--eb-border)] px-2 py-1.5">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-[var(--eb-muted)]">
                      {label as string}
                    </div>
                    <div className="text-xs text-[var(--eb-muted)]">{detail as string}</div>
                  </div>
                  <BiasChip bias={bias as CanonicalBias} />
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-[var(--eb-muted)]">
              {data.engine.explanation}
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-[var(--eb-text)]">
              Recommended Strategies
            </h2>
            {data.engine.recommended.length === 0 ? (
              <div className="rounded-lg border border-[var(--eb-border)] bg-[var(--eb-card)] p-4 text-sm text-[var(--eb-muted)]">
                No strategy is preferred right now.
                {data.engine.reasons.length > 0 && (
                  <ul className="mt-2 list-disc pl-4">
                    {data.engine.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {data.engine.recommended.map((s) => (
                  <StrategyCard key={s.profile.key} s={s} />
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-[var(--eb-text)]">
              Full Strategy Ranking
            </h2>
            <div className="overflow-x-auto rounded-lg border border-[var(--eb-border)]">
              <table className="w-full text-xs">
                <thead className="bg-[var(--eb-card)] text-[var(--eb-muted)]">
                  <tr>
                    <th className="px-2 py-1.5 text-left">Strategy</th>
                    <th className="px-2 py-1.5 text-left">Legs</th>
                    <th className="px-2 py-1.5 text-left">Bias</th>
                    <th className="px-2 py-1.5 text-left">Vol Stance</th>
                    <th className="px-2 py-1.5 text-right">Alignment</th>
                    <th className="px-2 py-1.5 text-right">Overall</th>
                  </tr>
                </thead>
                <tbody>
                  {data.engine.strategies.map((s) => (
                    <tr key={s.profile.key} className="border-t border-[var(--eb-border)]">
                      <td className="px-2 py-1.5 text-[var(--eb-text)]">{s.profile.label}</td>
                      <td className="px-2 py-1.5 text-[var(--eb-muted)]">{s.profile.legs}</td>
                      <td className="px-2 py-1.5 text-[var(--eb-muted)]">{s.profile.bias}</td>
                      <td className="px-2 py-1.5 text-[var(--eb-muted)]">{s.profile.volatilityStance}</td>
                      <td className="px-2 py-1.5 text-right text-[var(--eb-muted)]">{s.alignmentPct}%</td>
                      <td className="px-2 py-1.5 text-right text-[var(--eb-accent)]">{s.overallPct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <footer className="rounded border border-[var(--eb-border)] bg-[var(--eb-card)] p-3 text-xs text-[var(--eb-muted)]">
            {data.disclaimer}
          </footer>
        </>
      )}
    </div>
  );
}