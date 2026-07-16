import { classifyFreshness, formatAge, type FreshnessInput, type FreshnessResult } from "@/lib/data-freshness";

type Props = {
  input?: FreshnessInput;
  result?: FreshnessResult;
  provider?: string;
  compact?: boolean;
};

const STATUS_STYLES: Record<FreshnessResult["status"], { fg: string; label: string }> = {
  LIVE: { fg: "var(--eb-bull, #10b981)", label: "LIVE" },
  FRESH: { fg: "var(--eb-bull, #10b981)", label: "FRESH" },
  DELAYED: { fg: "var(--eb-neutral, #eab308)", label: "DELAYED" },
  STALE: { fg: "var(--eb-bear, #ef4444)", label: "STALE" },
  UNAVAILABLE: { fg: "var(--eb-bear, #ef4444)", label: "UNAVAILABLE" },
  ERROR: { fg: "var(--eb-bear, #ef4444)", label: "ERROR" },
};

export function DataFreshnessPill({ input, result, provider, compact }: Props) {
  const r = result ?? (input ? classifyFreshness(input) : null);
  if (!r) return null;
  const style = STATUS_STYLES[r.status];
  return (
    <span
      title={`${style.label}${provider ? " · " + provider : ""}\n${r.reason}\nAge: ${formatAge(r.ageMs)}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: compact ? "2px 8px" : "4px 10px",
        fontSize: compact ? 10 : 11,
        letterSpacing: 1,
        textTransform: "uppercase",
        borderRadius: 999,
        border: `1px solid ${style.fg}`,
        background: `color-mix(in oklab, ${style.fg} 15%, transparent)`,
        color: style.fg,
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
      }}
      aria-label={`Data freshness: ${style.label}, age ${formatAge(r.ageMs)}`}
    >
      <span aria-hidden>●</span>
      <span style={{ fontWeight: 600 }}>{style.label}</span>
      <span style={{ opacity: 0.75 }}>· {formatAge(r.ageMs)}</span>
      {provider ? <span style={{ opacity: 0.6 }}>· {provider}</span> : null}
    </span>
  );
}

export default DataFreshnessPill;