import type { StagingCheck } from "./staging-validation-types";

export interface AuthorizationProbe {
  id: string;
  denied: boolean;
  expectDeny: boolean;
  detail?: string;
  category?: "rls" | "role" | "plan" | "storage";
}

export function auditAuthorization(probes: readonly AuthorizationProbe[]): StagingCheck[] {
  const checks: StagingCheck[] = [];
  for (const p of probes) {
    const ok = p.expectDeny ? p.denied : !p.denied;
    const escalation = p.expectDeny && !p.denied;
    checks.push({
      id: `authz.${p.id}`,
      category: "SECURITY",
      title: `Authorization: ${p.id}`,
      status: ok ? "PASS" : "FAIL",
      severity: escalation ? "blocker" : ok ? "info" : "critical",
      detail: p.detail,
      hardBlocker: escalation,
    });
  }
  if (checks.some((c) => c.hardBlocker)) {
    checks.push({
      id: "authz.privilege_escalation",
      category: "SECURITY",
      title: "Privilege escalation detected",
      status: "FAIL",
      severity: "blocker",
      detail: "At least one probe returned access when it should have been denied.",
      hardBlocker: true,
    });
  }
  return checks;
}

export interface RlsCrossUserObservation {
  table: string;
  otherUsersRowsReturned: number;
}

export function auditRlsCrossUser(obs: readonly RlsCrossUserObservation[]): StagingCheck[] {
  return obs.map((o) => {
    const bad = o.otherUsersRowsReturned > 0;
    return {
      id: bad ? "rls.cross_user_read" : `rls.cross_user.${o.table}`,
      category: "SECURITY",
      title: `RLS cross-user read: ${o.table}`,
      status: bad ? "FAIL" : "PASS",
      severity: bad ? "blocker" : "info",
      detail: bad ? `${o.otherUsersRowsReturned} foreign rows returned` : "isolated",
      hardBlocker: bad,
    } as StagingCheck;
  });
}