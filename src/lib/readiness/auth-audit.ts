import type { ReadinessResult } from "./production-readiness-types";

export interface RouteAuthSpec {
  path: string;
  access: "public" | "authenticated" | "paid" | "admin" | "dev";
  guardKind: "public" | "_authenticated" | "custom" | "none";
  serverAuthorized: boolean;
}

export interface AuthAuditInput {
  environment: "development" | "staging" | "production" | "unknown";
  routes: readonly RouteAuthSpec[];
  diagnosticsOverrideEnabled: boolean;
  logoutInvalidatesQueries: boolean;
  sessionExpiryMinutes: number | null;
}

export function auditAuth(input: AuthAuditInput): ReadinessResult[] {
  const out: ReadinessResult[] = [];

  for (const r of input.routes) {
    if (r.access === "authenticated" || r.access === "paid" || r.access === "admin") {
      const bad = r.guardKind === "none" || r.guardKind === "public";
      out.push({
        id: `auth.route${r.path}`,
        category: "SECURITY",
        title: `Route guard: ${r.path}`,
        status: bad ? "FAIL" : r.serverAuthorized ? "PASS" : "WARNING",
        severity: bad ? "blocker" : r.serverAuthorized ? "info" : "warning",
        hardBlocker: bad,
        detail: bad
          ? `Protected route ${r.path} has no auth guard.`
          : !r.serverAuthorized
          ? "Route is guarded but server does not re-authorize."
          : undefined,
      });
    }
    if (r.access === "dev" && input.environment === "production" && !input.diagnosticsOverrideEnabled) {
      out.push({
        id: `auth.dev-route${r.path}`,
        category: "SECURITY",
        title: `Dev route active in prod: ${r.path}`,
        status: "WARNING",
        severity: "warning",
        detail:
          "Dev-only route exists in production build. Consider gating behind diagnostics override or removing.",
      });
    }
  }

  out.push({
    id: "auth.logout-hygiene",
    category: "SECURITY",
    title: "Sign-out hygiene",
    status: input.logoutInvalidatesQueries ? "PASS" : "WARNING",
    severity: input.logoutInvalidatesQueries ? "info" : "warning",
    detail: input.logoutInvalidatesQueries
      ? undefined
      : "Sign-out should clear cached queries and redirect via the auth gate.",
  });

  out.push({
    id: "auth.session-expiry",
    category: "SECURITY",
    title: "Session expiry configured",
    status:
      input.sessionExpiryMinutes == null
        ? "UNKNOWN"
        : input.sessionExpiryMinutes > 0 && input.sessionExpiryMinutes <= 60 * 24 * 30
        ? "PASS"
        : "WARNING",
    severity: "info",
    evidence: [{ key: "expiryMinutes", value: input.sessionExpiryMinutes ?? "unknown" }],
  });

  return out;
}
