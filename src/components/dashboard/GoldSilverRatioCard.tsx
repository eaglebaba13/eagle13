import { useMemo } from "react";
import type { IndexQuote } from "@/lib/market.functions";
import {
  computeGoldSilverSnapshot,
  distanceFromNearestThreshold,
  GOLD_SILVER_LOWER_THRESHOLD,
  GOLD_SILVER_UPPER_THRESHOLD,
} from "@/lib/gold-silver-ratio";

type Props = {
  gold: IndexQuote | null;
  silver: IndexQuote | null;
};

// Shared Gold–Silver Ratio card. Rendered identically on desktop and
// mobile from the same data hook (market-data / getMarketData).
export function GoldSilverRatioCard({ gold, silver }: Props) {
  const snap = useMemo(
    () =>
      computeGoldSilverSnapshot({
        goldPrice: gold?.livePrice ?? null,
        silverPrice: silver?.livePrice ?? null,
        goldUnit: "USD/oz",
        silverUnit: "USD/oz",
        goldTimestamp: gold?.updatedAt ?? null,
        silverTimestamp: silver?.updatedAt ?? null,
        provider: "Yahoo Finance (COMEX)",
      }),
    [gold, silver],
  );

  const isBuyGold = snap.signal === "BUY_GOLD";
  const isBuySilver = snap.signal === "BUY_SILVER";
  const isWait = snap.signal === "WAIT";
  const isUnavailable = snap.signal === "DATA_UNAVAILABLE";

  const accent = isBuyGold
    ? "var(--eb-accent, #f5b642)"
    : isBuySilver
      ? "var(--eb-muted, #9aa7b8)"
      : isUnavailable
        ? "var(--eb-bear, #ef4444)"
        : "var(--eb-neutral, #6b7280)";

  const headline = isBuyGold
    ? "BUY SIGNAL IN GOLD"
    : isBuySilver
      ? "BUY SIGNAL IN SILVER"
      : isUnavailable
        ? "DATA UNAVAILABLE"
        : "WAIT";

  const distance = snap.ratio != null ? distanceFromNearestThreshold(snap.ratio) : null;

  return (
    <section
      className="eb-card eb-glass"
      aria-labelledby="eb-gsr-title"
      style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}
    >
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span
            aria-hidden
            style={{
              width: 10, height: 10, borderRadius: 999, background: accent,
              boxShadow: `0 0 0 3px color-mix(in oklab, ${accent} 25%, transparent)`,
            }}
          />
          <h3 id="eb-gsr-title" className="eb-card-title" style={{ margin: 0, fontSize: 14, letterSpacing: 0.4 }}>
            GOLD–SILVER RATIO
          </h3>
        </div>
        <span
          title="Gold–Silver Ratio = Gold price / Silver price (both COMEX USD/oz). Signal boundaries: <55 BUY GOLD, 55–75 WAIT, >75 BUY SILVER."
          style={{
            fontFamily: "var(--eb-mono)", fontSize: 11, color: "var(--eb-muted)", cursor: "help",
          }}
        >
          ?
        </span>
      </header>

      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontFamily: "var(--eb-mono)", fontSize: 34, fontWeight: 700, color: accent, lineHeight: 1 }}>
          {snap.ratio != null ? snap.ratio.toFixed(2) : "—"}
        </div>
        <div
          style={{
            fontFamily: "var(--eb-mono)",
            fontSize: 12,
            letterSpacing: 0.6,
            padding: "4px 8px",
            borderRadius: 6,
            background: `color-mix(in oklab, ${accent} 15%, transparent)`,
            color: accent,
            border: `1px solid color-mix(in oklab, ${accent} 40%, transparent)`,
          }}
          aria-live="polite"
        >
          {headline}
        </div>
      </div>

      <div style={{ fontSize: 12, color: "var(--eb-muted)" }}>{snap.reason}</div>

      {/* Threshold scale */}
      <div style={{ marginTop: 4 }}>
        <div
          style={{
            position: "relative", height: 8, borderRadius: 999,
            background: "linear-gradient(90deg, var(--eb-accent, #f5b642), var(--eb-neutral, #6b7280) 30% 70%, var(--eb-muted, #9aa7b8))",
            opacity: 0.85,
          }}
          aria-hidden
        >
          {snap.ratio != null ? (
            <span
              style={{
                position: "absolute",
                left: `${Math.min(100, Math.max(0, ((snap.ratio - 40) / (90 - 40)) * 100))}%`,
                top: -3, width: 3, height: 14, background: "var(--eb-text, #fff)", transform: "translateX(-50%)",
                borderRadius: 2,
              }}
            />
          ) : null}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 10, color: "var(--eb-muted)", fontFamily: "var(--eb-mono)" }}>
          <span>40</span>
          <span>{GOLD_SILVER_LOWER_THRESHOLD} · Neutral · {GOLD_SILVER_UPPER_THRESHOLD}</span>
          <span>90</span>
        </div>
      </div>

      <dl
        style={{
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px",
          margin: 0, fontFamily: "var(--eb-mono)", fontSize: 11,
        }}
      >
        <dt style={{ color: "var(--eb-muted)" }}>Gold</dt>
        <dd style={{ margin: 0, textAlign: "right" }}>{gold ? `$${gold.livePrice.toFixed(2)}` : "—"}</dd>
        <dt style={{ color: "var(--eb-muted)" }}>Silver</dt>
        <dd style={{ margin: 0, textAlign: "right" }}>{silver ? `$${silver.livePrice.toFixed(2)}` : "—"}</dd>
        <dt style={{ color: "var(--eb-muted)" }}>Distance</dt>
        <dd style={{ margin: 0, textAlign: "right" }}>{distance != null ? distance.toFixed(2) : "—"}</dd>
        <dt style={{ color: "var(--eb-muted)" }}>Provider</dt>
        <dd style={{ margin: 0, textAlign: "right" }}>{snap.provider}</dd>
        <dt style={{ color: "var(--eb-muted)" }}>Freshness</dt>
        <dd style={{ margin: 0, textAlign: "right" }}>{snap.freshness}</dd>
        <dt style={{ color: "var(--eb-muted)" }}>Quality</dt>
        <dd style={{ margin: 0, textAlign: "right" }}>{snap.dataQuality}</dd>
      </dl>

      {isWait ? null : null}
    </section>
  );
}