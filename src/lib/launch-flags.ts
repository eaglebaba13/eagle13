// Phase 26 · Stage 4 — Launch feature flags.
//
// Safe defaults: only NIFTY50 / BANKNIFTY / INDIA VIX are enabled. All
// incomplete markets default to false. Client mirrors these defaults —
// server resolution comes from `getLaunchFlags`.

export interface LaunchFlags {
  readonly ENABLE_LAUNCH_NIFTY: boolean;
  readonly ENABLE_LAUNCH_BANKNIFTY: boolean;
  readonly ENABLE_LAUNCH_INDIA_VIX: boolean;
  readonly ENABLE_COMBINED_PCR: boolean;
  readonly ENABLE_MCX_COMMODITIES: boolean;
  readonly ENABLE_GLOBAL_METALS: boolean;
  readonly ENABLE_CRYPTO: boolean;
}

export const DEFAULT_LAUNCH_FLAGS: LaunchFlags = {
  ENABLE_LAUNCH_NIFTY: true,
  ENABLE_LAUNCH_BANKNIFTY: true,
  ENABLE_LAUNCH_INDIA_VIX: true,
  ENABLE_COMBINED_PCR: true,
  ENABLE_MCX_COMMODITIES: false,
  ENABLE_GLOBAL_METALS: false,
  ENABLE_CRYPTO: false,
};

function parseBool(v: string | undefined, fallback: boolean): boolean {
  if (v == null) return fallback;
  const s = v.trim().toLowerCase();
  if (s === "true" || s === "1" || s === "yes" || s === "on") return true;
  if (s === "false" || s === "0" || s === "no" || s === "off" || s === "") return false;
  return fallback;
}

/** Resolve flags from a shallow env-like object. Server use only. */
export function resolveLaunchFlags(env: Record<string, string | undefined>): LaunchFlags {
  return {
    ENABLE_LAUNCH_NIFTY: parseBool(env.ENABLE_LAUNCH_NIFTY, true),
    ENABLE_LAUNCH_BANKNIFTY: parseBool(env.ENABLE_LAUNCH_BANKNIFTY, true),
    ENABLE_LAUNCH_INDIA_VIX: parseBool(env.ENABLE_LAUNCH_INDIA_VIX, true),
    ENABLE_COMBINED_PCR: parseBool(env.ENABLE_COMBINED_PCR, true),
    ENABLE_MCX_COMMODITIES: parseBool(env.ENABLE_MCX_COMMODITIES, false),
    ENABLE_GLOBAL_METALS: parseBool(env.ENABLE_GLOBAL_METALS, false),
    ENABLE_CRYPTO: parseBool(env.ENABLE_CRYPTO, false),
  };
}