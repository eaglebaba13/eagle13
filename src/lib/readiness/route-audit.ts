import type { ReadinessResult } from "./production-readiness-types";
import type { RouteAuthSpec } from "./auth-audit";

export function auditRoutes(routes: readonly RouteAuthSpec[]): ReadinessResult[] {
  const out: ReadinessResult[] = [];
  for (const r of routes) {
    if ((r.access === "admin" || r.access === "paid") && r.guardKind === "public") {
      out.push({
        id: `route.${r.path}`,
        category: "SECURITY",
        title: `Route: ${r.path}`,
        status: "FAIL",
        severity: "blocker",
        hardBlocker: true,
        detail: `${r.access} route ${r.path} is not guarded.`,
      });
      continue;
    }
    out.push({
      id: `route.${r.path}`,
      category: "SECURITY",
      title: `Route: ${r.path}`,
      status: "PASS",
      severity: "info",
      evidence: [
        { key: "access", value: r.access },
        { key: "guard", value: r.guardKind },
        { key: "serverAuth", value: r.serverAuthorized },
      ],
    });
  }
  return out;
}
