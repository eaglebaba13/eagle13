// Phase 2I-B — Gann Gap Outlook dashboard widget.
//
// Research-only. Never renders BUY/SELL/LONG/SHORT wording.

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getGannGapOutlook } from "@/lib/gann-gap/gann-gap.functions";
import { getGannGapHistoricalValidation } from "@/lib/gann-gap/gann-gap.persistence.functions";
import { classifySampleStatus } from "@/lib/gann-gap/analytics";
import { GANN_GAP_DISCLAIMER, type GannGapOutlookLabel } from "@/lib/gann-gap/types";

const LABEL_TEXT: Record<GannGapOutlookLabel, string> = {
  PENDING: "Waiting for 15:26 IST",
  GAP_UP_RESEARCH: "Gap Up (Research)",
  GAP_DOWN_RESEARCH: "Gap Down (Research)",
  INDECISION: "Indecision",
  NO_VALID_SETUP: "No Valid Setup",
  DATA_UNAVAILABLE: "Data Unavailable",
};

const LABEL_TONE: Record<GannGapOutlookLabel, string> = {
  PENDING: "bg-muted text-muted-foreground border-border/60",
  GAP_UP_RESEARCH: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  GAP_DOWN_RESEARCH: "bg-red-500/15 text-red-300 border-red-500/40",
  INDECISION: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  NO_VALID_SETUP: "bg-muted text-muted-foreground border-border/60",
  DATA_UNAVAILABLE: "bg-red-500/10 text-red-200 border-red-500/30",
};

export function GannGapOutlookWidget() {
  const fetchOutlook = useServerFn(getGannGapOutlook);
  const fetchHist = useServerFn(getGannGapHistoricalValidation);
  const { data, error, isLoading } = useQuery({
    queryKey: ["gann-gap-outlook"],
    queryFn: () => fetchOutlook(),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
  });
  const hist = useQuery({
    queryKey: ["gann-gap-historical"],
    queryFn: () => fetchHist().catch(() => null),
    staleTime: 5 * 60_000,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card/60 p-4 text-sm">
        <p className="text-xs uppercase text-muted-foreground">Gann Gap Outlook</p>
        <p className="mt-2">Loading…</p>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="rounded-xl border border-border bg-card/60 p-4 text-sm">
        <p className="text-xs uppercase text-muted-foreground">Gann Gap Outlook</p>
        <p className="mt-2 text-muted-foreground">Outlook unavailable.</p>
      </div>
    );
  }

  if (!data.featureEnabled) {
    return (
      <div
        data-testid="gann-gap-outlook-widget"
        data-state="disabled"
        className="rounded-xl border border-border bg-card/60 p-4 text-sm"
      >
        <p className="text-xs uppercase text-muted-foreground">Gann Gap Outlook</p>
        <p className="mt-2 text-muted-foreground">Feature disabled.</p>
        <p className="mt-2 text-[11px] text-muted-foreground/80">{GANN_GAP_DISCLAIMER}</p>
      </div>
    );
  }

  const tone = LABEL_TONE[data.label];
  const text = LABEL_TEXT[data.label];
  const zone = data.zone;

  return (
    <div
      data-testid="gann-gap-outlook-widget"
      data-state={data.label.toLowerCase()}
      className="rounded-xl border border-border bg-card/60 p-4 text-sm"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase text-muted-foreground">Gann Gap Outlook</p>
        <div className="flex items-center gap-1.5">
          <span
            className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide"
            title={`Data source: ${data.source}`}
          >
            {data.source}
          </span>
          <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-sky-300">
            Research Only
          </span>
        </div>
      </div>
      <div className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}>
        {text}
      </div>
      {data.confirmations && data.confirmations.length > 0 && (
        <div className="mt-3 text-[11px] text-muted-foreground">
          Confirmations:{" "}
          <span className="text-foreground font-medium">
            {data.confirmations.filter((c) => c.alignment === "SUPPORTS_UP" || c.alignment === "SUPPORTS_DOWN").length}
          </span>
          {" aligned · "}
          <span className="text-foreground font-medium">
            {data.confirmations.filter((c) => c.alignment === "CONFLICT").length}
          </span>
          {" conflict · "}
          <span className="text-foreground font-medium">
            {data.confirmations.filter((c) => c.alignment === "UNAVAILABLE").length}
          </span>
          {" unavailable"}
        </div>
      )}
      <dl className="mt-3 grid gap-1 text-xs text-muted-foreground">
        <div>
          <dt className="inline">Lifecycle: </dt>
          <dd className="inline font-medium text-foreground">{data.lifecycle}</dd>
        </div>
        <div>
          <dt className="inline">For session: </dt>
          <dd className="inline font-medium text-foreground">{data.nextTradingDate || "—"}</dd>
        </div>
        {data.reference != null && (
          <div>
            <dt className="inline">Reference: </dt>
            <dd className="inline font-medium text-foreground">{data.reference.toFixed(2)}</dd>
          </div>
        )}
        {zone?.nearestBelow && (
          <div>
            <dt className="inline">Nearest support: </dt>
            <dd className="inline font-medium text-foreground">
              {zone.nearestBelow.level} (n={zone.nearestBelow.n})
            </dd>
          </div>
        )}
        {zone?.nearestAbove && (
          <div>
            <dt className="inline">Nearest resistance: </dt>
            <dd className="inline font-medium text-foreground">
              {zone.nearestAbove.level} (n={zone.nearestAbove.n})
            </dd>
          </div>
        )}
        {data.confidence && (
          <div>
            <dt className="inline">Confidence band: </dt>
            <dd className="inline font-medium text-foreground">{data.confidence.replace("EXPERIMENTAL_", "")}</dd>
          </div>
        )}
      </dl>
      <p className="mt-3 text-[11px] text-muted-foreground/80">{GANN_GAP_DISCLAIMER}</p>
      {hist.data && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
          <span className="rounded-full border border-border/60 px-2 py-0.5 text-muted-foreground">
            {classifySampleStatus(hist.data.metrics.evaluated).replace(/_/g, " ")}
          </span>
          {hist.data.metrics.winRatePct != null && hist.data.showRate && (
            <span className="rounded-full border border-border/60 px-2 py-0.5 text-muted-foreground">
              Accuracy {hist.data.metrics.winRatePct.toFixed(1)}% · n={hist.data.metrics.evaluated}
            </span>
          )}
          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-300">
            Experimental
          </span>
        </div>
      )}
    </div>
  );
}