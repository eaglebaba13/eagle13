// Phase 34 · Version metadata + changelog registry.
// Static, deterministic, and read-only. Never mutated at runtime.

export interface ReleaseEntry {
  readonly version: string;
  readonly date: string; // ISO date
  readonly title: string;
  readonly highlights: readonly string[];
  readonly notes?: readonly string[];
}

export const PLATFORM_VERSION = "1.0.0";
export const PLATFORM_BUILD_CHANNEL = "launch-candidate";
export const PLATFORM_FORMULA_VERSION = "EAGLEBABA_ASTRO_V1_1";
export const PLATFORM_PROVIDER_STACK = "Upstox (primary) · Yahoo (fallback)";

export const RELEASE_HISTORY: readonly ReleaseEntry[] = [
  {
    version: "1.0.0",
    date: "2026-07-17",
    title: "Launch Freeze — Version 1.0",
    highlights: [
      "Production UX polish across dashboard, decision, option chain, PCR, breadth.",
      "Unified loading / error / partial-provider copy replaces legacy Missing/Unavailable text.",
      "Compact Provider Health Bar with green/yellow/red rollup.",
      "Feature-flagged unverified widgets (Global Markets) hidden by default.",
      "Version info + changelog surface for subscribers.",
    ],
    notes: [
      "No research formulas changed.",
      "No provider paths changed.",
      "Broker execution remains disabled.",
    ],
  },
  {
    version: "0.32.0",
    date: "2026-07-17",
    title: "Historical Accuracy & Replay wiring",
    highlights: [
      "8-module Decision Intelligence Engine fully wired.",
      "Release-candidate composer requires manual human sign-off.",
    ],
  },
  {
    version: "0.31.0",
    date: "2026-07-17",
    title: "Production deployment framework",
    highlights: [
      "10-stage CI/CD pipeline, health endpoints, blue/green evaluator.",
      "Structured logs, metrics, DR runbooks.",
    ],
  },
];

export function latestRelease(): ReleaseEntry {
  return RELEASE_HISTORY[0];
}

export interface VersionInfo {
  readonly version: string;
  readonly channel: string;
  readonly formulaVersion: string;
  readonly providerStack: string;
  readonly lastUpdated: string;
}

export function versionInfo(): VersionInfo {
  return {
    version: PLATFORM_VERSION,
    channel: PLATFORM_BUILD_CHANNEL,
    formulaVersion: PLATFORM_FORMULA_VERSION,
    providerStack: PLATFORM_PROVIDER_STACK,
    lastUpdated: latestRelease().date,
  };
}