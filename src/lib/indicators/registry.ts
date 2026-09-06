// Provider-neutral indicator registry.
// Single source of truth for all available indicators.
// No UI, no provider, no chart coupling.

import type { IndicatorDefinition, IndicatorId } from "./types";
import { smaDefinition } from "./sma";
import { emaDefinition } from "./ema";
import { rsiDefinition } from "./rsi";
import { macdDefinition } from "./macd";
import { bollingerDefinition } from "./bollinger";
import { vwapDefinition } from "./vwap";

const registry = new Map<IndicatorId, IndicatorDefinition>();

function register(def: IndicatorDefinition): void {
  if (registry.has(def.id)) {
    throw new Error(`Duplicate indicator registration: ${def.id}`);
  }
  registry.set(def.id, def);
}

// Register built-in indicators
register(smaDefinition);
register(emaDefinition);
register(rsiDefinition);
register(macdDefinition);
register(bollingerDefinition);
register(vwapDefinition);

/**
 * Look up an indicator by ID.
 * Returns undefined if not found.
 */
export function getIndicator(id: IndicatorId): IndicatorDefinition | undefined {
  return registry.get(id);
}

/**
 * List all registered indicators.
 */
export function listIndicators(): readonly IndicatorDefinition[] {
  return [...registry.values()];
}

/**
 * Check if an indicator is registered.
 */
export function hasIndicator(id: IndicatorId): boolean {
  return registry.has(id);
}

/**
 * Register a custom indicator at runtime.
 * Throws if the ID is already registered.
 */
export function registerIndicator(def: IndicatorDefinition): void {
  register(def);
}

/**
 * Get all registered indicator IDs.
 */
export function listIndicatorIds(): readonly IndicatorId[] {
  return [...registry.keys()];
}
