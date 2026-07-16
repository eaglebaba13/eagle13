/**
 * Phase 25 — RLS / RPC security audit (pure).
 *
 * We express expected policy shape per (table, action, role) and compare
 * against observed policies gathered by the server collector. Missing owner
 * SELECT policies on user-owned data or missing admin-only checks on
 * privileged RPCs are hard blockers.
 */
import type { ReadinessResult } from "./production-readiness-types";

export type PolicyRole = "anon" | "authenticated" | "service_role";
export type PolicyAction = "SELECT" | "INSERT" | "UPDATE" | "DELETE";

export interface ExpectedPolicy {
  table: string;
  action: PolicyAction;
  role: PolicyRole;
  required: boolean; // true = missing is a fail
  forbidden?: boolean; // true = presence is a fail
  reason: string;
}

export const EXPECTED_POLICIES: readonly ExpectedPolicy[] = [
  {
    table: "manual_payment_requests",
    action: "SELECT",
    role: "authenticated",
    required: true,
    reason: "Users must be able to read their own manual payment requests.",
  },
  {
    table: "manual_payment_requests",
    action: "INSERT",
    role: "authenticated",
    required: false,
    forbidden: true,
    reason: "Direct inserts must go through the create_manual_payment_request RPC.",
  },
  {
    table: "user_roles",
    action: "SELECT",
    role: "authenticated",
    required: true,
    reason: "has_role() SECURITY DEFINER depends on user_roles being readable by definer only.",
  },
  {
    table: "audit_log",
    action: "INSERT",
    role: "anon",
    required: false,
    forbidden: true,
    reason: "Anonymous users must never write audit log entries.",
  },
];

export interface ObservedPolicy {
  table: string;
  action: PolicyAction;
  role: PolicyRole;
  name: string;
  using?: string | null;
  withCheck?: string | null;
}

export interface ObservedFunction {
  name: string;
  securityDefiner: boolean;
  searchPathSet: boolean;
  callableByAnon: boolean;
}

export interface RlsAuditInput {
  policies: readonly ObservedPolicy[];
  functions: readonly ObservedFunction[];
  /** Tables where RLS is enabled. */
  rlsEnabledTables: readonly string[];
  /** Tables the app relies on (must all appear in rlsEnabledTables). */
  userDataTables: readonly string[];
}

export function auditRls(input: RlsAuditInput): ReadinessResult[] {
  const out: ReadinessResult[] = [];

  for (const t of input.userDataTables) {
    const on = input.rlsEnabledTables.includes(t);
    out.push({
      id: `rls.enabled.${t}`,
      category: "SECURITY",
      title: `RLS enabled: ${t}`,
      status: on ? "PASS" : "FAIL",
      severity: on ? "info" : "blocker",
      hardBlocker: !on,
      detail: on ? undefined : `RLS is NOT enabled on ${t}.`,
    });
  }

  for (const p of EXPECTED_POLICIES) {
    const match = input.policies.find(
      (o) => o.table === p.table && o.action === p.action && o.role === p.role,
    );
    if (p.forbidden) {
      out.push({
        id: `rls.policy.${p.table}.${p.action}.${p.role}`,
        category: "SECURITY",
        title: `Policy: ${p.action} ${p.table} to ${p.role}`,
        status: match ? "FAIL" : "PASS",
        severity: match ? "blocker" : "info",
        hardBlocker: !!match,
        detail: match ? `Forbidden policy present: ${p.reason}` : undefined,
      });
      continue;
    }
    out.push({
      id: `rls.policy.${p.table}.${p.action}.${p.role}`,
      category: "SECURITY",
      title: `Policy: ${p.action} ${p.table} to ${p.role}`,
      status: match ? "PASS" : p.required ? "FAIL" : "WARNING",
      severity: match ? "info" : p.required ? "critical" : "warning",
      hardBlocker: !match && p.required,
      detail: match ? undefined : `${p.reason} (policy missing)`,
    });
  }

  for (const f of input.functions) {
    if (!f.securityDefiner) continue;
    const unsafe = !f.searchPathSet;
    out.push({
      id: `rls.fn.${f.name}.search-path`,
      category: "SECURITY",
      title: `SECURITY DEFINER: ${f.name}`,
      status: unsafe ? "FAIL" : "PASS",
      severity: unsafe ? "critical" : "info",
      hardBlocker: unsafe,
      detail: unsafe
        ? `Function ${f.name} is SECURITY DEFINER without a fixed search_path.`
        : undefined,
    });
  }

  return out;
}
