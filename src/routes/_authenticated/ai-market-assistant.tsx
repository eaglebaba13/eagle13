// Phase 3B — AI Market Assistant detail page (research-only).

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getAiMarketAssistant } from "@/lib/ai-market-assistant/assistant.functions";
import { PRESET_QUESTIONS } from "@/lib/ai-market-assistant/prompts";
import { answerPreset } from "@/lib/ai-market-assistant/assistant";
import type { AssistantBias, AssistantConfidence } from "@/lib/ai-market-assistant/types";

export const Route = createFileRoute("/_authenticated/ai-market-assistant")({
  head: () => ({
    meta: [
      { title: "AI Market Assistant — EagleBABA" },
      {
        name: "description",
        content:
          "Research-only assistant that explains the current market view using canonical Decision, PCR, GTI, Breadth, Astro, Gann and Strategy modules.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AiMarketAssistantPage,
});

const BIAS_COLOR: Record<AssistantBias, string> = {
  BULLISH: "text-[var(--eb-bull)]",
  BEARISH: "text-[var(--eb-bear)]",
  NEUTRAL: "text-[var(--eb-muted)]",
  CONFLICT: "text-[var(--eb-warn,#eab308)]",
  UNAVAILABLE: "text-[var(--eb-muted)] opacity-70",
};

const CONF_COLOR: Record<AssistantConfidence, string> = {
  HIGH: "text-[var(--eb-bull)]",
  MEDIUM: "text-[var(--eb-accent)]",
  LOW: "text-[var(--eb-warn,#eab308)]",
  UNAVAILABLE: "text-[var(--eb-muted)]",
};

function Chip({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`rounded-md border border-[var(--eb-border)] bg-[var(--eb-card)] px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {children}
    </span>
  );
}

function AiMarketAssistantPage() {
  const fn = useServerFn(getAiMarketAssistant);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["ai-market-assistant"],
    queryFn: () => fn(),
    staleTime: 30_000,
  });
  const [answer, setAnswer] = useState<{ q: string; a: string } | null>(null);

  const res = data?.response ?? null;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <header className="space-y-2">
        <h1 className="text-xl font-semibold text-[var(--eb-text)]">AI Market Assistant</h1>
        <p className="text-xs text-[var(--eb-muted)]">
          Deterministic explanation layer over canonical modules. No external AI. No broker execution.
          Research Only — Not Investment Advice.
        </p>
      </header>

      {isLoading && <div className="text-sm text-[var(--eb-muted)]">Loading canonical context…</div>}
      {error && (
        <div className="rounded-md border border-[var(--eb-warn,#eab308)] p-3 text-sm text-[var(--eb-warn,#eab308)]">
          Assistant unavailable. <button onClick={() => refetch()} className="underline">Retry</button>
        </div>
      )}

      {res && (
        <>
          <section className="rounded-lg border border-[var(--eb-border)] bg-[var(--eb-card)] p-4">
            <div className="flex flex-wrap items-center gap-3">
              <Chip className={BIAS_COLOR[res.marketBias]}>
                Aggregate: {res.marketBias}
              </Chip>
              {(() => {
                const de =
                  res.supportingEvidence.find((e) => e.module === "DECISION_ENGINE") ||
                  res.conflictingEvidence.find((e) => e.module === "DECISION_ENGINE");
                const bias = de?.bias ?? "UNAVAILABLE";
                return (
                  <Chip className={BIAS_COLOR[bias as AssistantBias] ?? ""}>
                    Decision Engine: {bias}
                  </Chip>
                );
              })()}
              <Chip className={CONF_COLOR[res.confidence]}>Confidence: {res.confidence}</Chip>
              <Chip>Data quality: {res.dataQuality.label}</Chip>
            </div>
            <p className="mt-3 text-base font-semibold text-[var(--eb-text)]">{res.headline}</p>
            <p className="mt-1 text-sm text-[var(--eb-muted)]">{res.summary}</p>
            <p className="mt-2 text-[11px] text-[var(--eb-muted)]">
              The Aggregate bias combines Decision, PCR, GTI, Breadth, Astro and Gann modules. It
              may differ from the standalone Decision Engine view — both are shown for clarity.
            </p>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-[var(--eb-border)] p-4">
              <h2 className="mb-2 text-sm font-semibold text-[var(--eb-text)]">Supporting Evidence</h2>
              {res.supportingEvidence.length === 0 ? (
                <p className="text-xs text-[var(--eb-muted)]">No supporting canonical signals.</p>
              ) : (
                <ul className="space-y-1 text-xs text-[var(--eb-text)]">
                  {res.supportingEvidence.map((e) => (
                    <li key={e.module}>
                      • <b>{e.module}</b> — {e.bias} <span className="text-[var(--eb-muted)]">({e.freshness})</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-lg border border-[var(--eb-border)] p-4">
              <h2 className="mb-2 text-sm font-semibold text-[var(--eb-text)]">Conflicting Signals</h2>
              {res.conflictingEvidence.length === 0 ? (
                <p className="text-xs text-[var(--eb-muted)]">No conflicting canonical signals.</p>
              ) : (
                <ul className="space-y-1 text-xs text-[var(--eb-text)]">
                  {res.conflictingEvidence.map((e) => (
                    <li key={e.module}>
                      • <b>{e.module}</b> — {e.bias} <span className="text-[var(--eb-muted)]">({e.freshness})</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-[var(--eb-border)] p-4">
              <h2 className="mb-2 text-sm font-semibold text-[var(--eb-text)]">Risk Factors</h2>
              {res.riskFactors.length === 0 ? (
                <p className="text-xs text-[var(--eb-muted)]">No elevated risk factors identified.</p>
              ) : (
                <ul className="space-y-1 text-xs text-[var(--eb-text)]">
                  {res.riskFactors.map((r, i) => <li key={i}>• {r}</li>)}
                </ul>
              )}
            </div>
            <div className="rounded-lg border border-[var(--eb-border)] p-4">
              <h2 className="mb-2 text-sm font-semibold text-[var(--eb-text)]">What Would Change the View</h2>
              <ul className="space-y-1 text-xs text-[var(--eb-text)]">
                {res.whatWouldChangeTheView.map((r, i) => <li key={i}>• {r}</li>)}
              </ul>
            </div>
          </section>

          <section className="rounded-lg border border-[var(--eb-border)] p-4">
            <h2 className="mb-2 text-sm font-semibold text-[var(--eb-text)]">Strategy Context</h2>
            {!res.strategyContext.available ? (
              <p className="text-xs text-[var(--eb-muted)]">Strategy context unavailable.</p>
            ) : (
              <div className="space-y-1 text-xs text-[var(--eb-text)]">
                <div><b>Preferred:</b> {res.strategyContext.preferredCategory}</div>
                <div><b>Rationale:</b> {res.strategyContext.rationale}</div>
                <div><b>Key risk:</b> {res.strategyContext.keyRisk}</div>
                <div><b>Required confirmation:</b> {res.strategyContext.requiredConfirmation}</div>
                <div><b>Invalidation:</b> {res.strategyContext.invalidation}</div>
              </div>
            )}
          </section>

          <section className="rounded-lg border border-[var(--eb-border)] p-4">
            <h2 className="mb-2 text-sm font-semibold text-[var(--eb-text)]">Ask the Assistant</h2>
            <div className="flex flex-wrap gap-2">
              {PRESET_QUESTIONS.map((q) => (
                <button
                  key={q.id}
                  onClick={() => setAnswer({ q: q.label, a: answerPreset(res, q.id) })}
                  className="rounded-md border border-[var(--eb-border)] bg-[var(--eb-card)] px-3 py-1 text-xs hover:border-[var(--eb-accent)]"
                >
                  {q.label}
                </button>
              ))}
            </div>
            {answer && (
              <div className="mt-3 rounded-md border border-[var(--eb-border)] p-3 text-xs">
                <div className="font-semibold text-[var(--eb-text)]">{answer.q}</div>
                <div className="mt-1 text-[var(--eb-muted)]">{answer.a}</div>
              </div>
            )}
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-[var(--eb-border)] p-4">
              <h2 className="mb-2 text-sm font-semibold text-[var(--eb-text)]">Data Quality</h2>
              <ul className="space-y-0.5 text-xs text-[var(--eb-text)]">
                <li>Live: {res.dataQuality.live}</li>
                <li>Research-only: {res.dataQuality.demo}</li>
                <li>Stale: {res.dataQuality.stale}</li>
                <li>Unavailable: {res.dataQuality.unavailable}</li>
                <li>Total: {res.dataQuality.total}</li>
              </ul>
            </div>
            <div className="rounded-lg border border-[var(--eb-border)] p-4">
              <h2 className="mb-2 text-sm font-semibold text-[var(--eb-text)]">Sources</h2>
              <div className="space-y-1 text-xs text-[var(--eb-text)]">
                <div><b>Used:</b> {res.sources.used.join(", ") || "none"}</div>
                <div><b>Unavailable:</b> {res.sources.unavailable.join(", ") || "none"}</div>
                <div><b>Stale:</b> {res.sources.stale.join(", ") || "none"}</div>
                <div><b>Research-only:</b> {res.sources.researchOnly.join(", ") || "none"}</div>
                <div className="text-[var(--eb-muted)]">Generated: {new Date(res.generatedAt).toLocaleString()}</div>
              </div>
            </div>
          </section>

          <footer className="pt-2 text-[10px] text-[var(--eb-muted)]">
            {res.disclaimer}
          </footer>
        </>
      )}
    </div>
  );
}