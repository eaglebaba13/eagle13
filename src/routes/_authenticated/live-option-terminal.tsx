// Phase 3A — Live Option Strategy Terminal (research-only, consumer module).
// Never places a broker order. Never modifies canonical formulas.

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getOptionStrategyTerminal } from "@/lib/option-strategy-terminal/terminal.functions";
import type { ScoredStrategy, CanonicalBias } from "@/lib/option-strategy-terminal";
import { describeVixRegime } from "@/lib/option-strategy-terminal";
import type { DecisionEngineOutput } from "@/lib/option-strategy-decision";
import type { InstitutionalFlowEngineOutput } from "@/lib/option-strategy-decision";

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

const ACTION_TONE: Record<DecisionEngineOutput["action"], { bg: string; label: string }> = {
  BUY_CALL: { bg: "bg-[var(--eb-bull)]/15 text-[var(--eb-bull)] border-[var(--eb-bull)]/40", label: "BUY CALL" },
  BUY_PUT: { bg: "bg-[var(--eb-bear)]/15 text-[var(--eb-bear)] border-[var(--eb-bear)]/40", label: "BUY PUT" },
  WAIT: { bg: "bg-[var(--eb-warn,#eab308)]/15 text-[var(--eb-warn,#eab308)] border-[var(--eb-warn,#eab308)]/40", label: "WAIT" },
  NO_TRADE: { bg: "bg-[var(--eb-muted)]/15 text-[var(--eb-muted)] border-[var(--eb-muted)]/40", label: "NO TRADE" },
};

function DecisionEnginePanel({ d }: { d: DecisionEngineOutput }) {
  const tone = ACTION_TONE[d.action];
  return (
    <section className="rounded-xl border border-[var(--eb-border)] bg-[var(--eb-card)] p-4 md:p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-stretch md:justify-between">
        <div className="flex-1">
          <div className="text-[10px] uppercase tracking-wide text-[var(--eb-muted)]">
            Market Decision Engine
          </div>
          <div className={`mt-2 inline-flex items-center rounded-lg border px-3 py-1.5 text-lg font-bold ${tone.bg}`}>
            {tone.label}
          </div>
          <div className="mt-2 text-sm text-[var(--eb-muted)]">
            Confidence <span className="font-semibold text-[var(--eb-text)]">{d.confidence}%</span>
            {" · "}Bull <span className="text-[var(--eb-bull)]">{d.bullScore}</span>
            {" · "}Bear <span className="text-[var(--eb-bear)]">{d.bearScore}</span>
          </div>
          {d.strike.available && d.strike.strike != null && (
            <div className="mt-2 text-sm text-[var(--eb-text)]">
              Recommended strike:{" "}
              <span className="font-semibold text-[var(--eb-accent)]">{d.strike.label}</span>
            </div>
          )}
          <div className="mt-1 text-xs text-[var(--eb-muted)]">
            VIX regime {d.vixRegime} · Sizing {d.sizing.suggestedSizePct}% ({d.sizing.risk})
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-wide text-[var(--eb-muted)]">
            Weighted Contributions
          </div>
          <ul className="mt-2 space-y-1 text-xs">
            {d.indicators.map((i) => {
              const color =
                i.bias === "BULLISH" ? "text-[var(--eb-bull)]"
                : i.bias === "BEARISH" ? "text-[var(--eb-bear)]"
                : i.bias === "NEUTRAL" ? "text-[var(--eb-muted)]"
                : "text-[var(--eb-muted)] opacity-70";
              return (
                <li key={i.key} className="flex items-center justify-between gap-2">
                  <span className="text-[var(--eb-text)]">
                    {i.label}{" "}
                    <span className="text-[var(--eb-muted)]">({Math.round(i.weight * 100)}%)</span>
                  </span>
                  <span className={`font-mono ${color}`}>
                    {i.available ? `+${i.bullContribution} / -${i.bearContribution}` : "UNAVAILABLE"}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {d.reasoning.length > 0 && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-[var(--eb-muted)]">
              Reasoning
            </div>
            <ul className="mt-1 space-y-0.5 text-xs text-[var(--eb-text)]">
              {d.reasoning.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </div>
          {(d.warnings.length > 0 || d.conflicts.length > 0) && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-[var(--eb-muted)]">
                Warnings & Conflicts
              </div>
              <ul className="mt-1 space-y-0.5 text-xs text-[var(--eb-warn,#eab308)]">
                {d.warnings.map((w, i) => <li key={`w${i}`}>⚠ {w}</li>)}
                {d.conflicts.map((c, i) => <li key={`c${i}`}>⚑ {c}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {(d.leadingSector || d.weakestSector) && (
        <div className="mt-3 text-xs text-[var(--eb-muted)]">
          {d.leadingSector && <>Leading sector: <span className="text-[var(--eb-bull)]">{d.leadingSector}</span>. </>}
          {d.weakestSector && <>Weakest: <span className="text-[var(--eb-bear)]">{d.weakestSector}</span>.</>}
        </div>
      )}
      <div className="mt-3 text-[10px] text-[var(--eb-muted)]">{d.disclaimer}</div>
    </section>
  );
}

function BiasChip({ bias }: { bias: CanonicalBias }) {
  return (
    <span
      className={`rounded-md border border-[var(--eb-border)] px-2 py-0.5 text-xs font-medium ${BIAS_COLOR[bias]}`}
    >
      {bias}
    </span>
  );
}

// ---- Phase 28 — Institutional Flow & Probability Panel ----
function statusIcon(s: "PASS" | "FAIL" | "UNAVAILABLE"): string {
  return s === "PASS" ? "✓" : s === "FAIL" ? "✕" : "—";
}
function biasClass(b: string): string {
  if (b === "BULLISH") return "text-[var(--eb-bull)]";
  if (b === "BEARISH") return "text-[var(--eb-bear)]";
  if (b === "NEUTRAL") return "text-[var(--eb-muted)]";
  return "text-[var(--eb-muted)] opacity-70";
}
function InstitutionalFlowPanel({ ife }: { ife: InstitutionalFlowEngineOutput }) {
  return (
    <section className="space-y-4 rounded-xl border border-[var(--eb-border)] bg-[var(--eb-card)] p-4 md:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-[var(--eb-muted)]">
            Institutional Flow & Probability Engine
          </div>
          <div className="mt-1 text-sm text-[var(--eb-text)]">
            Regime <span className="font-semibold text-[var(--eb-accent)]">{ife.regime.replaceAll("_", " ")}</span>
            {" · "}Confidence <span className="font-semibold">{ife.confidence.value}%</span>
            {" · "}Agreement <span className={biasClass(ife.signalAgreement.level === "STRONG" || ife.signalAgreement.level === "VERY_STRONG" ? "BULLISH" : "NEUTRAL")}>
              {ife.signalAgreement.level.replaceAll("_", " ")}
            </span>
          </div>
        </div>
        <div className="text-xs text-[var(--eb-muted)]">
          Data quality {ife.dataQuality.overall}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {/* Combined PCR */}
        <div className="rounded-lg border border-[var(--eb-border)] p-3">
          <div className="text-[10px] uppercase text-[var(--eb-muted)]">Combined PCR</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-lg font-semibold text-[var(--eb-text)]">
              {ife.combinedPcr.value != null ? ife.combinedPcr.value.toFixed(2) : "—"}
            </span>
            <span className={`text-xs ${biasClass(ife.combinedPcr.bias)}`}>{ife.combinedPcr.bias}</span>
          </div>
          <ul className="mt-2 space-y-0.5 text-xs">
            {ife.combinedPcr.contributions.map((c) => (
              <li key={c.index} className="flex justify-between">
                <span className="text-[var(--eb-muted)]">{c.index}</span>
                <span className={c.available ? "text-[var(--eb-text)]" : "text-[var(--eb-muted)] opacity-60"}>
                  {c.available ? `${c.contributionPct}%` : "Unavailable"}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* OI Structure */}
        <div className="rounded-lg border border-[var(--eb-border)] p-3">
          <div className="text-[10px] uppercase text-[var(--eb-muted)]">OI Build-up</div>
          <div className="mt-1 text-sm font-semibold text-[var(--eb-text)]">
            {ife.oiClassifier.classification.replaceAll("_", " ")}
          </div>
          <div className={`mt-1 text-xs ${biasClass(ife.oiClassifier.bias)}`}>{ife.oiClassifier.bias}</div>
          <div className="mt-1 text-xs text-[var(--eb-muted)]">{ife.oiClassifier.note}</div>
        </div>

        {/* VWAP */}
        <div className="rounded-lg border border-[var(--eb-border)] p-3">
          <div className="text-[10px] uppercase text-[var(--eb-muted)]">VWAP Confirmation</div>
          <div className="mt-1 text-sm font-semibold text-[var(--eb-text)]">
            {ife.vwap.position.replaceAll("_", " ")}
          </div>
          <div className="mt-1 text-xs text-[var(--eb-muted)]">
            {ife.vwap.available ? `${ife.vwap.distancePct}% vs VWAP` : "Feed unavailable"}
          </div>
        </div>

        {/* Price Confirmation */}
        <div className="rounded-lg border border-[var(--eb-border)] p-3">
          <div className="text-[10px] uppercase text-[var(--eb-muted)]">Price Position</div>
          <div className="mt-1 text-sm font-semibold text-[var(--eb-text)]">
            {ife.priceConfirmation.position.replaceAll("_", " ")}
          </div>
          <div className="mt-1 text-xs text-[var(--eb-muted)]">{ife.priceConfirmation.note}</div>
          <div className="mt-1 text-[11px] text-[var(--eb-muted)]">
            S {ife.priceConfirmation.support ?? "—"} · R {ife.priceConfirmation.resistance ?? "—"}
          </div>
        </div>

        {/* Institutional Flow Summary */}
        <div className="rounded-lg border border-[var(--eb-border)] p-3">
          <div className="text-[10px] uppercase text-[var(--eb-muted)]">Institutional Flow</div>
          <div className="mt-1 text-xs">
            <div className="flex justify-between">
              <span className="text-[var(--eb-muted)]">Buying</span>
              <span className="text-[var(--eb-bull)]">{ife.institutionalFlow.buyingPressurePct}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--eb-muted)]">Selling</span>
              <span className="text-[var(--eb-bear)]">{ife.institutionalFlow.sellingPressurePct}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--eb-muted)]">Neutral</span>
              <span>{ife.institutionalFlow.neutralFlowPct}%</span>
            </div>
          </div>
          <div className={`mt-1 text-xs ${biasClass(ife.institutionalFlow.bias)}`}>
            Current Bias {ife.institutionalFlow.bias}
          </div>
        </div>

        {/* Strike Advice */}
        <div className="rounded-lg border border-[var(--eb-border)] p-3">
          <div className="text-[10px] uppercase text-[var(--eb-muted)]">Strike Recommendation</div>
          {ife.strikeAdvice.available ? (
            <>
              <div className="mt-1 text-sm font-semibold text-[var(--eb-accent)]">
                {ife.strikeAdvice.strike} {ife.strikeAdvice.optionType}{" "}
                <span className="text-xs text-[var(--eb-muted)]">({ife.strikeAdvice.moneyness})</span>
              </div>
              <div className="mt-1 text-xs text-[var(--eb-muted)]">{ife.strikeAdvice.reason}</div>
              <div className="mt-1 text-[11px] text-[var(--eb-muted)]">
                Risk {ife.strikeAdvice.risk} · {ife.strikeAdvice.expectedEnvironment}
              </div>
            </>
          ) : (
            <div className="mt-1 text-xs text-[var(--eb-muted)]">No strike — {ife.strikeAdvice.reason}</div>
          )}
        </div>
      </div>

      {/* Trade readiness */}
      <div className="rounded-lg border border-[var(--eb-border)] p-3">
        <div className="flex items-baseline justify-between">
          <div className="text-[10px] uppercase text-[var(--eb-muted)]">Trade Readiness</div>
          <div className="text-xs text-[var(--eb-text)]">
            Passed <span className="font-semibold">{ife.tradeReadiness.passed}</span> / {ife.tradeReadiness.total}
          </div>
        </div>
        <ul className="mt-2 grid gap-1 text-xs sm:grid-cols-2 md:grid-cols-3">
          {ife.tradeReadiness.items.map((it) => (
            <li key={it.key} className="flex items-center justify-between gap-2 rounded border border-[var(--eb-border)] px-2 py-1">
              <span className="text-[var(--eb-text)]">{it.label}</span>
              <span
                className={
                  it.status === "PASS"
                    ? "text-[var(--eb-bull)]"
                    : it.status === "FAIL"
                    ? "text-[var(--eb-bear)]"
                    : "text-[var(--eb-muted)] opacity-70"
                }
              >
                {statusIcon(it.status)} <span className="text-[var(--eb-muted)]">{it.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Signal Agreement + Explanation */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-[var(--eb-border)] p-3">
          <div className="text-[10px] uppercase text-[var(--eb-muted)]">Signal Agreement</div>
          <div className="mt-1 text-sm text-[var(--eb-text)]">
            {ife.signalAgreement.level.replaceAll("_", " ")}{" "}
            <span className="text-xs text-[var(--eb-muted)]">
              ({ife.signalAgreement.agree} agree · {ife.signalAgreement.disagree} disagree ·{" "}
              {ife.signalAgreement.neutral} neutral)
            </span>
          </div>
          <ul className="mt-2 grid grid-cols-2 gap-1 text-xs">
            {ife.signalAgreement.participants.map((p) => (
              <li key={p.key} className="flex justify-between">
                <span className="text-[var(--eb-muted)]">{p.label}</span>
                <span className={biasClass(p.bias)}>{p.bias}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border border-[var(--eb-border)] p-3">
          <div className="text-[10px] uppercase text-[var(--eb-muted)]">Explainable Reasoning</div>
          <div className="mt-1 text-sm text-[var(--eb-text)]">
            {ife.explanation.action.replaceAll("_", " ")}{" "}
            <span className="text-xs text-[var(--eb-muted)]">— {ife.explanation.confidence}% confidence</span>
          </div>
          <ul className="mt-1 space-y-0.5 text-xs text-[var(--eb-text)]">
            {ife.explanation.bullets.slice(0, 8).map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="text-[10px] text-[var(--eb-muted)]">{ife.disclaimer}</div>
    </section>
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
          <DecisionEnginePanel d={data.decisionEngine} />

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