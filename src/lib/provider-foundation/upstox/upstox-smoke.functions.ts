import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { UpstoxSmokeReport } from "./upstox-smoke.server";

/**
 * Admin-only Upstox live-provider smoke test. Read-only. Never returns
 * API keys, secrets, tokens, or Authorization headers.
 */
export const testUpstoxProvider = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // OUTER SAFE BOUNDARY — this handler MUST NEVER throw. Any failure at
    // dynamic-import, admin-role RPC, adapter, or serialization time is
    // converted into a redacted, JSON-only report before returning.
    const startedAtIso = new Date().toISOString();
    try {
      // Dynamic import: server-only module MUST NOT ship to the client bundle.
      const {
        runUpstoxSmokeTest,
        buildUpstoxSmokeFailureReport,
        buildApplicationAuthFailureReport,
        buildServerFunctionFailureReport,
        sanitizeForJson,
      } = await import("./upstox-smoke.server");

      let isAdmin: boolean | null = null;
      try {
        const { data } = await context.supabase.rpc("has_role", {
          _user_id: context.userId,
          _role: "admin",
        });
        isAdmin = data === true;
      } catch {
        isAdmin = null;
      }
      if (isAdmin !== true) {
        return sanitizeForJson(
          buildApplicationAuthFailureReport(
            isAdmin === null ? "Admin role check failed." : "Admin role required.",
            { nowIso: startedAtIso },
          ),
        ) as UpstoxSmokeReport;
      }

      let report;
      try {
        report = await runUpstoxSmokeTest({ nowIso: startedAtIso });
      } catch (inner) {
        report = buildUpstoxSmokeFailureReport(inner, { nowIso: startedAtIso });
      }
      try {
        return sanitizeForJson(report) as UpstoxSmokeReport;
      } catch (sErr) {
        // Sanitization itself failed — return a minimal SERIALIZATION report.
        return sanitizeForJson({
          ...buildServerFunctionFailureReport(sErr, { nowIso: startedAtIso }),
          errorSource: "SERIALIZATION",
          serializationStatus: "FAIL",
        }) as UpstoxSmokeReport;
      }
    } catch (outer) {
      // Last-resort safe fallback that survives even a dynamic-import crash.
      const safeMessage = outer instanceof Error
        ? String(outer.message ?? "server function failed").slice(0, 240)
        : "server function failed";
      const redacted = safeMessage
        .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
        .replace(/UPSTOX_(API_KEY|API_SECRET|ACCESS_TOKEN)=[^\s"']+/gi, "UPSTOX_$1=[REDACTED]");
      return {
        at: startedAtIso,
        generatedAt: startedAtIso,
        requestStartedAt: startedAtIso,
        requestCompletedAt: new Date().toISOString(),
        durationMs: 0,
        status: "FAIL" as const,
        errorSource: "SERVER_FUNCTION" as const,
        safeError: redacted,
        httpStatus: null,
        endpointFailed: null,
        serializationStatus: "OK" as const,
        checklist: {
          authentication: "FAIL" as const,
          instrumentMaster: "FAIL" as const,
          quoteApi: "FAIL" as const,
          historicalApi: "FAIL" as const,
          intradayApi: "FAIL" as const,
          cache: "NOT_CONFIGURED" as const,
          health: "FAIL" as const,
        },
        symbolResults: [],
        configured: false,
        authenticated: false,
        tokenStatus: {
          tokenPresent: false,
          tokenSource: "NONE" as const,
          tokenExpiryStatus: "UNKNOWN" as const,
          tokenUsable: false,
          reason: redacted,
          mode: "disabled" as const,
          apiKeyConfigured: false,
          apiSecretConfigured: false,
        },
        instrumentResolved: [],
        quoteResults: [
          {
            endpoint: "quote" as const,
            symbol: "SYSTEM",
            ok: false,
            latencyMs: 0,
            requestId: null,
            providerStatus: "FAILED",
            marketSession: "UNKNOWN",
            cacheHit: false,
            safeError: redacted,
            errorSource: "SERVER_FUNCTION" as const,
            dataQuality: null,
          },
        ],
        historicalResults: [],
        intradayResults: [],
        summary: {
          quoteSuccess: false,
          historicalSuccess: false,
          intradaySuccess: false,
          overall: "FAIL" as const,
          errorSource: "SERVER_FUNCTION" as const,
          safeError: redacted,
        },
        cache: { hits: 0, misses: 0, writes: 0 },
        health: { totalCalls: 0, errors: 1, avgLatencyMs: 0 },
      };
    }
  });