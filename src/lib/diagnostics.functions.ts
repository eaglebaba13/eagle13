import { createServerFn } from "@tanstack/react-start";
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

export const getServerDiagnostics = createServerFn({ method: "GET" }).handler(
  async (): Promise<ServerDiagnostics> => {
    const cache = getCacheMetrics();
    let corrected = 0;
    let legacy = 0;
    let unversioned = 0;
    for (const k of cache.keys) {
      if (k.key.includes(`${CACHE_NAMESPACE_VERSION}:`)) {
        if (isLegacyAstroFormula(DEFAULT_ASTRO_FORMULA_VERSION) === false && k.key.includes(DEFAULT_ASTRO_FORMULA_VERSION)) {
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
      cache,
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
        hosts: getApiHealth(),
        log: getApiLog(),
      },
      errors: getErrorLog(),
    };
  },
);