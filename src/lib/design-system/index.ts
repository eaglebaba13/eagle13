// Phase 42 — Canonical Design System tokens (JS surface).
// Presentational only. Colours are sourced from CSS variables in
// src/styles.css; this module exposes the semantic band helpers so
// components render consistent status/confidence chips without
// re-implementing the mapping.

export type StatusKind =
  | "buy"
  | "sell"
  | "wait"
  | "info"
  | "astro"
  | "success"
  | "warning"
  | "error";

export type ConfidenceBand = "deep" | "high" | "mid" | "low" | "weak";

/** Map a 0-100 confidence value to a canonical band. */
export function confidenceBand(pct: number): ConfidenceBand {
  const v = Number.isFinite(pct) ? pct : 0;
  if (v >= 90) return "deep";
  if (v >= 75) return "high";
  if (v >= 60) return "mid";
  if (v >= 40) return "low";
  return "weak";
}

/** Human label for a confidence band. */
export function confidenceLabel(band: ConfidenceBand): string {
  switch (band) {
    case "deep": return "Very High";
    case "high": return "High";
    case "mid":  return "Moderate";
    case "low":  return "Low";
    case "weak": return "Very Low";
  }
}

/** CSS custom-property name for a status kind. */
export function statusVar(kind: StatusKind): string {
  return `var(--eb-status-${kind})`;
}

/** CSS custom-property name for a confidence band. */
export function confidenceVar(band: ConfidenceBand): string {
  switch (band) {
    case "deep": return "var(--eb-conf-90)";
    case "high": return "var(--eb-conf-75)";
    case "mid":  return "var(--eb-conf-60)";
    case "low":  return "var(--eb-conf-40)";
    case "weak": return "var(--eb-conf-low)";
  }
}
