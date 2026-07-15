// Phase 21.4 · Stage 4C — HYBRID_SHADOW_V1 validator.
// Pure event log. Never triggers notifications, sound, email, broker,
// Decision Engine, or live alerts. ENTRY_READY_SHADOW is gated behind
// strict safety checks; anything unsafe resolves to WAIT or DATA_INCOMPLETE.

import type { DataQualityState } from "./data-quality-state";
import type { HybridDecision } from "./hybrid-decision";

export const HYBRID_SHADOW_VERSION = "HYBRID_SHADOW_V1" as const;

export type ShadowEventType =
  | "DATA_LOADING"
  | "DATA_READY"
  | "ASTRO_READY"
  | "SMC_READY"
  | "AGREEMENT_BUY"
  | "AGREEMENT_SELL"
  | "CONFLICT"
  | "WAIT"
  | "DATA_INCOMPLETE"
  | "ENTRY_READY_SHADOW"
  | "TARGET_HIT_SHADOW"
  | "STOP_HIT_SHADOW"
  | "INVALIDATED";

export type ShadowEvent = {
  type: ShadowEventType;
  timestamp: string;
  instrument: string;
  timeframe: string;
  provider: string;
  providerStatus: DataQualityState;
  astroDirection: "BUY" | "SELL" | "WAIT" | null;
  smcDirection: "BUY" | "SELL" | "WAIT" | "CONFLICT" | "INVALID" | null;
  hybridDirection: HybridDecision["direction"] | null;
  score: number;
  runId: string;
  reasons: readonly string[];
  outcome: "OPEN" | "TARGET" | "STOP" | "INVALIDATED" | "NONE";
  version: typeof HYBRID_SHADOW_VERSION;
};

export type ShadowEvaluationInput = {
  instrument: string;
  timeframe: string;
  provider: string;
  providerStatus: DataQualityState;
  candleClosed: boolean;
  sameSession: boolean;
  expectedAstroFormula: string;
  expectedSmcFormula: string;
  astroFormula: string | null;
  smcFormula: string | null;
  hybrid: HybridDecision;
  hybridScoreThreshold: number;
  runId: string;
  timestamp?: string;
};

export function evaluateShadow(input: ShadowEvaluationInput): ShadowEvent {
  const base: Omit<ShadowEvent, "type" | "reasons" | "outcome"> = {
    timestamp: input.timestamp ?? new Date().toISOString(),
    instrument: input.instrument,
    timeframe: input.timeframe,
    provider: input.provider,
    providerStatus: input.providerStatus,
    astroDirection:
      input.hybrid.direction === "FORMULA_MISMATCH" ? null : null,
    smcDirection: null,
    hybridDirection: input.hybrid.direction,
    score: input.hybrid.hybridScore,
    runId: input.runId,
    version: HYBRID_SHADOW_VERSION,
  };

  const wrap = (
    type: ShadowEventType,
    reasons: readonly string[],
    outcome: ShadowEvent["outcome"] = "NONE",
  ): ShadowEvent => ({ ...base, type, reasons, outcome });

  if (input.hybrid.direction === "FORMULA_MISMATCH") {
    return wrap("DATA_INCOMPLETE", input.hybrid.reasons);
  }
  if (input.hybrid.direction === "DATA_INCOMPLETE") {
    return wrap("DATA_INCOMPLETE", input.hybrid.reasons);
  }
  if (input.hybrid.direction === "CONFLICT") {
    return wrap("CONFLICT", input.hybrid.reasons);
  }
  if (input.hybrid.direction === "WAIT") {
    return wrap("WAIT", input.hybrid.reasons);
  }

  const reasons: string[] = [...input.hybrid.reasons];
  if (
    input.astroFormula &&
    input.astroFormula !== input.expectedAstroFormula
  ) {
    reasons.push("SHADOW_BLOCK: astro formula mismatch");
    return wrap("DATA_INCOMPLETE", reasons);
  }
  if (input.smcFormula && input.smcFormula !== input.expectedSmcFormula) {
    reasons.push("SHADOW_BLOCK: smc formula mismatch");
    return wrap("DATA_INCOMPLETE", reasons);
  }
  if (!input.candleClosed) {
    reasons.push("SHADOW_BLOCK: unclosed candle");
    return wrap("WAIT", reasons);
  }
  if (!input.sameSession) {
    reasons.push("SHADOW_BLOCK: session mismatch");
    return wrap("WAIT", reasons);
  }
  if (input.providerStatus !== "LIVE" && input.providerStatus !== "DELAYED") {
    reasons.push(`SHADOW_BLOCK: provider status ${input.providerStatus}`);
    return wrap("DATA_INCOMPLETE", reasons);
  }
  if (input.hybrid.hybridScore < input.hybridScoreThreshold) {
    reasons.push(
      `SHADOW_BLOCK: score ${input.hybrid.hybridScore} < threshold ${input.hybridScoreThreshold}`,
    );
    return wrap("WAIT", reasons);
  }

  const type: ShadowEventType =
    input.hybrid.direction === "BUY" ? "AGREEMENT_BUY" : "AGREEMENT_SELL";
  reasons.push(`SHADOW_READY: ${input.hybrid.direction}`);
  return {
    ...base,
    type,
    reasons,
    outcome: "OPEN",
    // ENTRY_READY_SHADOW is emitted as a separate event below when the caller
    // opts to persist it — this keeps the pure evaluator single-purpose.
  };
}

export function markEntryReady(evt: ShadowEvent): ShadowEvent {
  if (evt.type !== "AGREEMENT_BUY" && evt.type !== "AGREEMENT_SELL") return evt;
  return { ...evt, type: "ENTRY_READY_SHADOW" };
}

// ---- Persistence ---------------------------------------------------------

const STORAGE_KEY = "hybrid_shadow_v1";
const MAX_EVENTS = 100;

type StorageLike = {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
};

function defaultStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadShadowHistory(storage?: StorageLike | null): ShadowEvent[] {
  const s = storage ?? defaultStorage();
  if (!s) return [];
  try {
    const raw = s.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as ShadowEvent[];
  } catch {
    return [];
  }
}

export function appendShadowEvent(
  evt: ShadowEvent,
  storage?: StorageLike | null,
): ShadowEvent[] {
  const s = storage ?? defaultStorage();
  const list = loadShadowHistory(s);
  list.push(evt);
  while (list.length > MAX_EVENTS) list.shift();
  if (s) {
    try {
      s.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {
      // ignore quota errors — shadow history is best-effort
    }
  }
  return list;
}

export function clearShadowHistory(storage?: StorageLike | null): void {
  const s = storage ?? defaultStorage();
  if (!s) return;
  try {
    s.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}