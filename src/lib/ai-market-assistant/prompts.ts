// Phase 3B — Preset deterministic question set.

import type { AssistantQuestionId } from "./types";

export interface PresetQuestion {
  readonly id: AssistantQuestionId;
  readonly label: string;
}

export const PRESET_QUESTIONS: readonly PresetQuestion[] = [
  { id: "MARKET_BIAS", label: "What is the current market bias?" },
  { id: "WHY_BULLISH", label: "Why is the market bullish?" },
  { id: "WHY_BEARISH", label: "Why is the market bearish?" },
  { id: "CONFLICTING_SIGNALS", label: "What signals are conflicting?" },
  { id: "STRATEGY_CONTEXT", label: "What strategy context is preferred?" },
  { id: "INVALIDATION", label: "What would invalidate the current view?" },
  { id: "UNAVAILABLE_MODULES", label: "Which modules are unavailable?" },
  { id: "DATA_RELIABILITY", label: "How reliable is the current data?" },
];

export function findPreset(id: string): PresetQuestion | null {
  return PRESET_QUESTIONS.find((q) => q.id === id) ?? null;
}