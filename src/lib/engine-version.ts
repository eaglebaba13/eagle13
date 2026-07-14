/**
 * EagleBaba Engine v1.0 — frozen calculation core.
 * These versions are surfaced in the License panel, headers, and reports so
 * users always know which deterministic engine produced their results.
 */
export const ENGINE_VERSION = {
  engine: "v1.0",
  formula: "v1.0",
  astro: "v1.0",
  signal: "v1.0",
  decision: "v1.0",
  risk: "v1.0",
  backtest: "v1.0",
  replay: "v1.0",
  options: "v1.0",
  broker: "v1.0",
  saas: "v0.1",
} as const;

export type EngineVersion = typeof ENGINE_VERSION;