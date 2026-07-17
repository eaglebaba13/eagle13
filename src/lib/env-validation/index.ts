// Phase 31 · Environment validation.
//
// Pure, deterministic check that required secrets/env vars are present.
// Callers pass an env-record snapshot (usually `process.env`). This module
// never reads `process.env` itself so it can be unit-tested with fixtures.

export type EnvRequirement = {
  key: string;
  category:
    | "secrets"
    | "api-keys"
    | "database"
    | "storage"
    | "email"
    | "razorpay"
    | "oauth"
    | "feature-flags"
    | "provider-keys";
  required: boolean;
  description: string;
};

export type EnvValidationResult = {
  ok: boolean;
  missingRequired: string[];
  missingOptional: string[];
  presentKeys: string[];
  byCategory: Record<string, { total: number; present: number; missing: string[] }>;
};

export const DEFAULT_ENV_REQUIREMENTS: EnvRequirement[] = [
  { key: "SUPABASE_URL", category: "secrets", required: true, description: "Supabase project URL" },
  { key: "SUPABASE_PUBLISHABLE_KEY", category: "secrets", required: true, description: "Supabase publishable key" },
  { key: "SUPABASE_SERVICE_ROLE_KEY", category: "secrets", required: true, description: "Supabase service role key (server only)" },
  { key: "SUPABASE_DB_URL", category: "database", required: true, description: "Direct database URL" },
  { key: "LOVABLE_API_KEY", category: "api-keys", required: true, description: "Lovable AI Gateway key" },
  { key: "UPSTOX_API_KEY", category: "provider-keys", required: true, description: "Upstox API key" },
  { key: "UPSTOX_API_SECRET", category: "provider-keys", required: true, description: "Upstox API secret" },
  { key: "UPSTOX_ACCESS_TOKEN", category: "provider-keys", required: false, description: "Upstox access token (rotates)" },
  { key: "UPSTOX_MARKET_DATA_MODE", category: "feature-flags", required: false, description: "Provider mode toggle" },
  { key: "LIVE_ORDER_ENABLED", category: "feature-flags", required: false, description: "Broker order execution toggle (must be false at launch)" },
  { key: "BROKER_ORDER_EXECUTION_ENABLED", category: "feature-flags", required: false, description: "Broker order execution toggle (must be false at launch)" },
];

export function validateEnv(
  env: Record<string, string | undefined>,
  requirements: EnvRequirement[] = DEFAULT_ENV_REQUIREMENTS,
): EnvValidationResult {
  const missingRequired: string[] = [];
  const missingOptional: string[] = [];
  const presentKeys: string[] = [];
  const byCategory: EnvValidationResult["byCategory"] = {};

  for (const req of requirements) {
    const raw = env[req.key];
    const present = typeof raw === "string" && raw.trim().length > 0;
    const cat = (byCategory[req.category] ||= { total: 0, present: 0, missing: [] });
    cat.total += 1;
    if (present) {
      cat.present += 1;
      presentKeys.push(req.key);
    } else {
      cat.missing.push(req.key);
      if (req.required) missingRequired.push(req.key);
      else missingOptional.push(req.key);
    }
  }

  return {
    ok: missingRequired.length === 0,
    missingRequired,
    missingOptional,
    presentKeys,
    byCategory,
  };
}

/**
 * Assert-style helper: throws if any required env var is missing.
 * Intended for server bootstrap paths (never at module top-level of client
 * files, per stack rules).
 */
export function assertRequiredEnv(
  env: Record<string, string | undefined>,
  requirements: EnvRequirement[] = DEFAULT_ENV_REQUIREMENTS,
): void {
  const result = validateEnv(env, requirements);
  if (!result.ok) {
    throw new Error(
      `Missing required environment variables: ${result.missingRequired.join(", ")}`,
    );
  }
}