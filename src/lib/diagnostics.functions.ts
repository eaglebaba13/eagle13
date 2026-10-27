import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { assertAuth, requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getCacheMetrics } from "./server-cache";
import { getApiHealth, getApiLog, getApiTotals, getErrorLog } from "./diagnostics";
import {
  CACHE_NAMESPACE_VERSION,
  DEFAULT_ASTRO_FORMULA_VERSION,
  astroFormulaLabel,
  isLegacyAstroFormula,
  type AstroFormulaVersion,
} from "./engine-version";

export type ServerDiagnostics = {
  ts: number;
  isDev: boolean;
  cache: ReturnType<typeof getCacheMetrics>;
  formulaVersion: {
    default: AstroFormulaVersion;
    label: string;
    cacheNamespace: string;
    correctedCacheEntries: number;
    legacyCacheEntries: number;
    unversionedCacheEntries: number;
  };
  api: {
    totals: ReturnType<typeof getApiTotals>;
    hosts: ReturnType<typeof getApiHealth>;
    log: ReturnType<typeof getApiLog>;
  };
  errors: ReturnType<typeof getErrorLog>;
};

// This boundary must precede auth: claim verification can throw before the handler.
// Do not retain the original exception, cause, stack or provider error response.
const diagnosticsFailureBoundary = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    try {
      return await next();
    } catch {
      const error = new Error("Diagnostics unavailable");
      delete error.stack;
      throw error;
    }
  },
);

export const getServerDiagnostics = createServerFn({ method: "GET" })
  .middleware([diagnosticsFailureBoundary, requireSupabaseAuth])
  .handler(async ({ context }): Promise<ServerDiagnostics> => {
    assertAuth(context);
    if (typeof context.userId !== "string" || context.claims.sub !== context.userId) {
      throw new Error("Diagnostics unavailable");
    }
    const role = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!role || role.error !== null || role.data !== true) {
      throw new Error("Diagnostics unavailable");
    }

    // No diagnostics collector may run before the strict admin check above.
    const cache = getCacheMetrics();
    let corrected = 0;
    let legacy = 0;
    let unversioned = 0;
    for (const k of cache.keys) {
      if (k.key.includes(`${CACHE_NAMESPACE_VERSION}:`)) {
        if (
          isLegacyAstroFormula(DEFAULT_ASTRO_FORMULA_VERSION) === false &&
          k.key.includes(DEFAULT_ASTRO_FORMULA_VERSION)
        ) {
          corrected += 1;
        } else if (k.key.includes("LEGACY_EAGLEBABA_CASCADE_V1")) {
          legacy += 1;
        } else {
          corrected += 1;
        }
      } else {
        unversioned += 1;
      }
    }
    return {
      ts: Date.now(),
      isDev: process.env.NODE_ENV !== "production",
      // Cache keys and free-text logs may embed credentials or internal URLs.
      // Preserve field types and numerical metrics, not arbitrary sensitive text.
      cache: {
        ...cache,
        keys: cache.keys.map((entry, index) => ({ ...entry, key: `cache-entry-${index + 1}` })),
      },
      formulaVersion: {
        default: DEFAULT_ASTRO_FORMULA_VERSION,
        label: astroFormulaLabel(DEFAULT_ASTRO_FORMULA_VERSION),
        cacheNamespace: CACHE_NAMESPACE_VERSION,
        correctedCacheEntries: corrected,
        legacyCacheEntries: legacy,
        unversionedCacheEntries: unversioned,
      },
      api: {
        totals: getApiTotals(),
        hosts: getApiHealth().map((entry, index) => ({
          ...entry,
          host: `host-${index + 1}`,
          ...(entry.lastError === undefined ? {} : { lastError: "[REDACTED]" }),
        })),
        log: getApiLog().map((entry) => ({
          ...entry,
          host: "[REDACTED]",
          url: "[REDACTED]",
          ...(entry.error === undefined ? {} : { error: "[REDACTED]" }),
        })),
      },
      errors: getErrorLog().map((entry) => ({
        ...entry,
        message: "[REDACTED]",
        ...(entry.source === undefined ? {} : { source: "[REDACTED]" }),
        ...(entry.stack === undefined ? {} : { stack: "[REDACTED]" }),
      })),
    };
  });
