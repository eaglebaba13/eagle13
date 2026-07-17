// Phase 3B — Compact AI Market Assistant widget for the dashboard.
// Never renders long generated paragraphs; single-line summary.

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { getAiMarketAssistant } from "@/lib/ai-market-assistant/assistant.functions";
import type { AssistantBias, AssistantConfidence } from "@/lib/ai-market-assistant/types";

const BIAS_TONE: Record<AssistantBias, string> = {
  BULLISH: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  BEARISH: "bg-red-500/15 text-red-300 border-red-500/40",
  NEUTRAL: "bg-muted text-muted-foreground border-border/60",
  CONFLICT: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  UNAVAILABLE: "bg-muted text-muted-foreground border-border/60 opacity-70",
};

const CONF_TONE: Record<AssistantConfidence, string> = {
  HIGH: "text-emerald-300",
  MEDIUM: "text-sky-300",
  LOW: "text-amber-300",
  UNAVAILABLE: "text-muted-foreground",
};

export function AiMarketAssistantWidget() {
  const fn = useServerFn(getAiMarketAssistant);
  const { data, isLoading, error } = useQuery({
    queryKey: ["ai-market-assistant-widget"],
    queryFn: () => fn(),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border/60 p-3 text-xs text-muted-foreground">
        AI assistant loading…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="rounded-lg border border-red-500/30 p-3 text-xs text-red-300">
        AI assistant unavailable
      </div>
    );
  }
  const r = data.response;
  const topSupport = r.supportingEvidence[0]?.module ?? "—";
  const topConflict = r.conflictingEvidence[0]?.module ?? "—";

  return (
    <div className="rounded-lg border border-border/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          AI Market Summary
        </div>
        <span
          className={`rounded-md border px-2 py-0.5 text-[10px] font-medium ${BIAS_TONE[r.marketBias]}`}
        >
          {r.marketBias}
        </span>
      </div>
      <p className="mt-2 line-clamp-2 text-sm text-foreground">{r.headline}</p>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <div>Confidence: <span className={CONF_TONE[r.confidence]}>{r.confidence}</span></div>
        <div>Data: {r.dataQuality.label}</div>
        <div>Support: <span className="text-foreground">{topSupport}</span></div>
        <div>Conflict: <span className="text-foreground">{topConflict}</span></div>
      </div>
      <div className="mt-2 flex justify-end">
        <Link
          to="/ai-market-assistant"
          className="text-[11px] font-medium text-sky-300 hover:underline"
        >
          Open Assistant →
        </Link>
      </div>
    </div>
  );
}