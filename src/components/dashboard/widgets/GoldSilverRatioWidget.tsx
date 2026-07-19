// Phase 3F.2A — Gold / Silver Ratio dashboard widget.
// Consumer-only. Shares the ["coindcx-markets"] query cache with other
// crypto widgets. No trading, no execution controls.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Scale } from "lucide-react";
import { listCoindcxMarkets } from "@/lib/providers/coindcx/coindcx.functions";
import {
  buildGoldSilverInput,
  computeGoldSilverRatio,
  formatRatio,
  GOLD_SILVER_BUY_GOLD_THRESHOLD,
  GOLD_SILVER_BUY_SILVER_THRESHOLD,
} from "@/lib/metal-ratio";
import type { GoldSilverRatioResult, GoldSilverSignal } from "@/lib/metal-ratio";

const SIGNAL_LABEL: Record<GoldSilverSignal, string> = {
  BUY_GOLD: "BUY GOLD",
  BUY_SILVER: "BUY SILVER",
  NEUTRAL: "WAIT / NEUTRAL",
  UNAVAILABLE: "UNAVAILABLE",
};

const SIGNAL_TONE: Record<GoldSilverSignal, string> = {
  BUY_GOLD: "text-amber-300 border-amber-400/40 bg-amber-400/10",
  BUY_SILVER: "text-sky-200 border-sky-400/40 bg-sky-400/10",
  NEUTRAL: "text-muted-foreground border-border/60 bg-card/40",
  UNAVAILABLE: "text-red-300 border-red-400/40 bg-red-400/10",
};

function RatioScale({ ratio }: { ratio: number | null }) {
  const min = 30;
  const max = 100;
  const clamped =
    ratio == null ? null : Math.max(min, Math.min(max, ratio));
  const pos = (v: number) => ((v - min) / (max - min)) * 100;
  return (
    <div className="mt-3" aria-hidden>
      <div className="relative h-2 rounded-full bg-gradient-to-r from-amber-400/40 via-slate-400/40 to-sky-400/40">
        <span
          className="absolute top-0 h-2 w-px bg-foreground/60"
          style={{ left: `${pos(GOLD_SILVER_BUY_GOLD_THRESHOLD)}%` }}
        />
        <span
          className="absolute top-0 h-2 w-px bg-foreground/60"
          style={{ left: `${pos(GOLD_SILVER_BUY_SILVER_THRESHOLD)}%` }}
        />
        {clamped != null && (
          <span
            className="absolute -top-1 h-4 w-1 rounded bg-foreground shadow"
            style={{ left: `calc(${pos(clamped)}% - 2px)` }}
          />
        )}
      </div>
      <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
        <span>BUY GOLD · &lt; {GOLD_SILVER_BUY_GOLD_THRESHOLD}</span>
        <span>NEUTRAL {GOLD_SILVER_BUY_GOLD_THRESHOLD}–{GOLD_SILVER_BUY_SILVER_THRESHOLD}</span>
        <span>BUY SILVER · &gt; {GOLD_SILVER_BUY_SILVER_THRESHOLD}</span>
      </div>
    </div>
  );
}

function Methodology() {
  return (
    <details className="mt-3 rounded border border-border/40 bg-card/30 p-2 text-[11px] text-muted-foreground">
      <summary className="cursor-pointer font-medium text-foreground">Methodology</summary>
      <p className="mt-1">
        Gold/Silver Ratio compares the normalized price of one troy ounce of Gold
        with one troy ounce of Silver.
      </p>
      <ul className="mt-1 list-disc pl-4">
        <li>Above 80 — Silver is relatively cheaper (BUY SILVER).</li>
        <li>Below 50 — Gold is relatively cheaper (BUY GOLD).</li>
        <li>Between 50 and 80 inclusive — WAIT / NEUTRAL.</li>
      </ul>
      <p className="mt-1 italic">
        This is a configured research rule, not guaranteed financial advice.
      </p>
    </details>
  );
}

export function GoldSilverRatioWidget() {
  const fn = useServerFn(listCoindcxMarkets);
  const { data, isLoading, error } = useQuery({
    queryKey: ["coindcx-markets"],
    queryFn: () => fn(),
    staleTime: 10_000,
    refetchInterval: 15_000,
    retry: false,
  });

  const result: GoldSilverRatioResult = useMemo(() => {
    const input = buildGoldSilverInput(data?.snapshots ?? []);
    return computeGoldSilverRatio(input);
  }, [data]);

  const isUnavail = result.signal === "UNAVAILABLE";
  const srSignal = SIGNAL_LABEL[result.signal];
  const srRatio = result.ratio == null ? "unavailable" : formatRatio(result.ratio);

  return (
    <div
      className="rounded-lg border border-border/60 p-3"
      role="region"
      aria-label="Gold Silver Ratio"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Scale size={13} aria-hidden /> Gold / Silver Ratio
        </div>
        <span
          className={`rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${SIGNAL_TONE[result.signal]}`}
          role={isUnavail ? "alert" : "status"}
          aria-label={`Signal: ${srSignal}. Ratio: ${srRatio}.`}
        >
          {SIGNAL_LABEL[result.signal]}
        </span>
      </div>

      {isLoading && (
        <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">
          Loading gold and silver instruments…
        </p>
      )}
      {error && (
        <p className="mt-2 text-xs text-red-300" role="alert">
          Ratio unavailable — provider error
        </p>
      )}

      <div className="mt-2 flex items-baseline gap-2">
        <span
          className="text-2xl font-semibold tabular-nums text-foreground"
          aria-label={`Current Gold Silver Ratio ${srRatio}`}
        >
          {formatRatio(result.ratio)}
        </span>
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {result.freshness}
        </span>
      </div>

      {isUnavail && result.reason && (
        <p className="mt-1 text-[11px] text-red-300" role="alert">
          {result.reason}
        </p>
      )}

      <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <Row
          label="Gold"
          value={
            result.goldInstrument
              ? `${result.goldInstrument}${result.normalizedGoldPrice != null ? ` · ${result.normalizedGoldPrice.toFixed(2)} ${result.quoteCurrency ?? ""}/oz` : ""}`
              : "—"
          }
        />
        <Row
          label="Silver"
          value={
            result.silverInstrument
              ? `${result.silverInstrument}${result.normalizedSilverPrice != null ? ` · ${result.normalizedSilverPrice.toFixed(2)} ${result.quoteCurrency ?? ""}/oz` : ""}`
              : "—"
          }
        />
        <Row label="Quote" value={result.quoteCurrency ?? "—"} />
        <Row label="Unit" value={result.normalizedUnit ?? "—"} />
        <Row
          label="Gold source"
          value={result.goldClassification ?? "—"}
        />
        <Row
          label="Silver source"
          value={result.silverClassification ?? "—"}
        />
        <Row label="Method" value={result.conversionMethod ?? "—"} />
        <Row
          label="Calculated"
          value={
            result.calculatedAt
              ? new Date(result.calculatedAt).toLocaleTimeString()
              : "—"
          }
        />
      </dl>

      <RatioScale ratio={result.ratio} />
      <Methodology />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border/40 bg-card/30 px-2 py-1">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 truncate font-medium text-foreground">{value}</dd>
    </div>
  );
}

export default GoldSilverRatioWidget;