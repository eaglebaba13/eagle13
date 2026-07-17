// Phase 2I-C — Canonical confirmation adapters for Gann Gap Outlook.
//
// Pure. Each adapter takes a small, already-resolved input describing the
// state of a canonical module (Decision, PCR, GTI, Breadth, VIX, Astro) and
// returns a `GannGapConfirmation`. Adapters never fetch and never mutate.
// UNAVAILABLE inputs must degrade the confirmation to `alignment: UNAVAILABLE`
// with a truthful reason — no fabricated bias.

import type { GannGapConfirmation } from "./types";

export type ConfirmationBias = "SUPPORTS_UP" | "SUPPORTS_DOWN";
export type CanonicalDirection = "BULLISH" | "BEARISH" | "NEUTRAL" | "UNKNOWN";

function align(dir: CanonicalDirection, bias: ConfirmationBias): GannGapConfirmation["alignment"] {
  if (dir === "UNKNOWN") return "UNAVAILABLE";
  if (dir === "NEUTRAL") return "NEUTRAL";
  const supportsUp = dir === "BULLISH";
  const supportsDown = dir === "BEARISH";
  if (bias === "SUPPORTS_UP" && supportsUp) return "SUPPORTS_UP";
  if (bias === "SUPPORTS_DOWN" && supportsDown) return "SUPPORTS_DOWN";
  return "CONFLICT";
}

export interface DecisionConfirmationInput {
  readonly available: boolean;
  readonly bias: "BULL" | "BEAR" | "NEUTRAL" | null;
  readonly confidence?: number | null;
  readonly source?: string;
  readonly observedAt?: string;
  readonly reason?: string;
  readonly freshnessSec?: number | null;
}

export function decisionConfirmation(
  input: DecisionConfirmationInput,
  bias: ConfirmationBias,
): GannGapConfirmation {
  const dir: CanonicalDirection =
    !input.available || input.bias == null
      ? "UNKNOWN"
      : input.bias === "BULL"
        ? "BULLISH"
        : input.bias === "BEAR"
          ? "BEARISH"
          : "NEUTRAL";
  return {
    id: "decision",
    label: "Decision Intelligence Engine",
    module: "DECISION_ENGINE",
    available: input.available,
    status: input.available ? "AVAILABLE" : "UNAVAILABLE",
    direction: dir,
    alignment: align(dir, bias),
    source: input.source ?? "DECISION",
    capability: input.available ? "COMPUTED" : "UNAVAILABLE",
    observedAt: input.observedAt,
    freshnessSec: input.freshnessSec ?? null,
    reason: input.reason ?? (input.available ? "Decision snapshot healthy" : "Decision snapshot unavailable"),
    detail: input.available
      ? `Decision bias ${input.bias}${input.confidence != null ? ` @ ${Math.round(input.confidence)}` : ""}`
      : "Decision unavailable — confirmation skipped",
  };
}

export interface PcrConfirmationInput {
  readonly available: boolean;
  readonly direction: "CE" | "NEUTRAL" | "PE" | null;
  readonly score?: number | null;
  readonly observedAt?: string;
  readonly source?: string;
  readonly reason?: string;
  readonly freshnessSec?: number | null;
}

export function pcrConfirmation(
  input: PcrConfirmationInput,
  bias: ConfirmationBias,
): GannGapConfirmation {
  const dir: CanonicalDirection =
    !input.available || input.direction == null
      ? "UNKNOWN"
      : input.direction === "CE"
        ? "BULLISH"
        : input.direction === "PE"
          ? "BEARISH"
          : "NEUTRAL";
  return {
    id: "combined-pcr",
    label: "Combined PCR",
    module: "COMBINED_PCR",
    available: input.available,
    status: input.available ? "COMPUTED" : "UNAVAILABLE",
    direction: dir,
    alignment: align(dir, bias),
    source: input.source ?? "OPTIONS",
    capability: input.available ? "COMPUTED" : "UNAVAILABLE",
    observedAt: input.observedAt,
    freshnessSec: input.freshnessSec ?? null,
    reason: input.reason ?? (input.available ? "PCR computed" : "PCR unavailable"),
    detail: input.available
      ? `PCR ${input.direction}${input.score != null ? ` (score ${input.score.toFixed(2)})` : ""}`
      : "Combined PCR unavailable — confirmation skipped",
  };
}

export interface GtiConfirmationInput {
  readonly available: boolean;
  readonly state: string | null;
  readonly confidence?: number | null;
  readonly source?: string;
  readonly observedAt?: string;
  readonly reason?: string;
  readonly freshnessSec?: number | null;
}

function gtiStateToDirection(state: string | null): CanonicalDirection {
  if (state == null) return "UNKNOWN";
  const s = state.toUpperCase();
  if (s.includes("BULL")) return "BULLISH";
  if (s.includes("BEAR")) return "BEARISH";
  if (s.includes("NEUTRAL") || s.includes("NO_TRADE") || s.includes("MIXED")) return "NEUTRAL";
  return "UNKNOWN";
}

export function gtiConfirmation(
  input: GtiConfirmationInput,
  bias: ConfirmationBias,
): GannGapConfirmation {
  const dir = input.available ? gtiStateToDirection(input.state) : "UNKNOWN";
  return {
    id: "gti",
    label: "Global Trend Indicator (GTI)",
    module: "GTI",
    available: input.available,
    status: input.available ? (input.state ?? "AVAILABLE") : "UNAVAILABLE",
    direction: dir,
    alignment: align(dir, bias),
    source: input.source ?? "BREADTH",
    capability: input.available ? "COMPUTED" : "UNAVAILABLE",
    observedAt: input.observedAt,
    freshnessSec: input.freshnessSec ?? null,
    reason: input.reason ?? (input.available ? `GTI state ${input.state}` : "GTI unavailable"),
    detail: input.available
      ? `GTI ${input.state}${input.confidence != null ? ` @ ${Math.round(input.confidence)}` : ""}`
      : "GTI unavailable — confirmation skipped",
  };
}

export interface BreadthConfirmationInput {
  readonly available: boolean;
  readonly netBreadth: number | null;
  readonly source?: string;
  readonly observedAt?: string;
  readonly reason?: string;
  readonly freshnessSec?: number | null;
}

export function breadthConfirmation(
  input: BreadthConfirmationInput,
  bias: ConfirmationBias,
): GannGapConfirmation {
  let dir: CanonicalDirection = "UNKNOWN";
  if (input.available && input.netBreadth != null && Number.isFinite(input.netBreadth)) {
    if (input.netBreadth > 0) dir = "BULLISH";
    else if (input.netBreadth < 0) dir = "BEARISH";
    else dir = "NEUTRAL";
  }
  return {
    id: "market-breadth",
    label: "Market Breadth",
    module: "MARKET_BREADTH",
    available: input.available,
    status: input.available ? "AVAILABLE" : "UNAVAILABLE",
    direction: dir,
    alignment: align(dir, bias),
    source: input.source ?? "BREADTH",
    capability: input.available ? "COMPUTED" : "UNAVAILABLE",
    observedAt: input.observedAt,
    freshnessSec: input.freshnessSec ?? null,
    reason: input.reason ?? (input.available ? "Breadth reading available" : "Breadth unavailable"),
    detail: input.available
      ? `Net breadth ${input.netBreadth ?? "n/a"}`
      : "Breadth unavailable — confirmation skipped",
  };
}

export interface VixConfirmationInput {
  readonly available: boolean;
  readonly value: number | null;
  readonly rising?: boolean | null;
  readonly source?: string;
  readonly observedAt?: string;
  readonly reason?: string;
  readonly freshnessSec?: number | null;
}

/** VIX heuristic: high VIX ≥ 20 or rising VIX supports downside; falling VIX supports upside. */
export function vixConfirmation(
  input: VixConfirmationInput,
  bias: ConfirmationBias,
): GannGapConfirmation {
  let dir: CanonicalDirection = "UNKNOWN";
  if (input.available && input.value != null && Number.isFinite(input.value)) {
    if (input.value >= 20 || input.rising === true) dir = "BEARISH";
    else if (input.value < 15 && input.rising === false) dir = "BULLISH";
    else dir = "NEUTRAL";
  }
  return {
    id: "india-vix",
    label: "India VIX",
    module: "INDIA_VIX",
    available: input.available,
    status: input.available ? "LIVE" : "UNAVAILABLE",
    direction: dir,
    alignment: align(dir, bias),
    source: input.source ?? "QUOTES",
    capability: input.available ? "LIVE" : "UNAVAILABLE",
    observedAt: input.observedAt,
    freshnessSec: input.freshnessSec ?? null,
    reason: input.reason ?? (input.available ? `VIX ${input.value}` : "VIX unavailable"),
    detail: input.available
      ? `India VIX ${input.value?.toFixed(2)}${input.rising == null ? "" : input.rising ? " (rising)" : " (falling)"}`
      : "India VIX unavailable — confirmation skipped",
  };
}

export interface AstroConfirmationInput {
  readonly available: boolean;
  readonly bias: "BULL" | "BEAR" | "NEUTRAL" | null;
  readonly source?: string;
  readonly observedAt?: string;
  readonly reason?: string;
  readonly freshnessSec?: number | null;
}

export function astroConfirmation(
  input: AstroConfirmationInput,
  bias: ConfirmationBias,
): GannGapConfirmation {
  const dir: CanonicalDirection = !input.available || input.bias == null
    ? "UNKNOWN"
    : input.bias === "BULL"
      ? "BULLISH"
      : input.bias === "BEAR"
        ? "BEARISH"
        : "NEUTRAL";
  return {
    id: "astro",
    label: "Astro Signal",
    module: "ASTRO",
    available: input.available,
    status: input.available ? "COMPUTED" : "UNAVAILABLE",
    direction: dir,
    alignment: align(dir, bias),
    source: input.source ?? "ASTRO",
    capability: input.available ? "COMPUTED" : "UNAVAILABLE",
    observedAt: input.observedAt,
    freshnessSec: input.freshnessSec ?? null,
    reason: input.reason ?? (input.available ? `Astro bias ${input.bias}` : "Astro unavailable"),
    detail: input.available
      ? `Astro bias ${input.bias}`
      : "Astro unavailable — confirmation skipped",
  };
}
