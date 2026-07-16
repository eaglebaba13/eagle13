/**
 * Phase 25 — Secret hygiene audit (pure).
 *
 * Operates on a supplied `SecretAuditInput` — file scans, bundle scans and
 * env presence are collected elsewhere. This module never receives raw
 * secret values.
 */
import type { ReadinessResult } from "./production-readiness-types";

export interface SecretAuditInput {
  /** Files that reference `client.server` from client-reachable modules. */
  clientServerLeaks: readonly string[];
  /** Files where `SUPABASE_SERVICE_ROLE_KEY` appears in the client bundle graph. */
  serviceRoleClientRefs: readonly string[];
  /** `.env` files tracked by source control (should be empty). */
  envInSource: readonly string[];
  /** Signed URL TTLs (seconds) observed in the codebase. Any >3600 is a warning. */
  signedUrlTtlsSeconds: readonly number[];
  /** Files that log full request/response bodies with credentials. */
  suspectLogSites: readonly string[];
  environment: "development" | "staging" | "production" | "unknown";
}

export function auditSecrets(input: SecretAuditInput): ReadinessResult[] {
  const out: ReadinessResult[] = [];

  const clientLeak = input.clientServerLeaks.length + input.serviceRoleClientRefs.length;
  out.push({
    id: "secret.client-bundle-leak",
    category: "SECURITY",
    title: "Service-role in client bundle",
    status: clientLeak === 0 ? "PASS" : "FAIL",
    severity: clientLeak === 0 ? "info" : "blocker",
    hardBlocker: clientLeak > 0,
    detail:
      clientLeak === 0
        ? "No client-reachable imports of `client.server` or service-role key."
        : `${clientLeak} client-reachable references detected.`,
    remediation:
      clientLeak > 0
        ? "Move server-only imports inside `.handler()` bodies with dynamic import."
        : undefined,
    evidence: [{ key: "leakCount", value: clientLeak }],
  });

  out.push({
    id: "secret.env-in-source",
    category: "SECURITY",
    title: ".env not tracked in source",
    status: input.envInSource.length === 0 ? "PASS" : "FAIL",
    severity: input.envInSource.length === 0 ? "info" : "blocker",
    hardBlocker: input.envInSource.length > 0,
    detail:
      input.envInSource.length === 0
        ? ".env files not present in source control."
        : `${input.envInSource.length} .env file(s) tracked in source.`,
    remediation:
      input.envInSource.length > 0
        ? "Remove .env from source control and rotate any exposed values."
        : undefined,
  });

  const badTtl = input.signedUrlTtlsSeconds.filter((s) => s <= 0 || s > 3600);
  out.push({
    id: "secret.signed-url-ttl",
    category: "SECURITY",
    title: "Signed URL TTL bounded",
    status: badTtl.length === 0 ? "PASS" : "WARNING",
    severity: badTtl.length === 0 ? "info" : "warning",
    detail: badTtl.length
      ? `${badTtl.length} signed URL TTL(s) exceed 3600s or are non-positive.`
      : "All signed URL TTLs are bounded ≤ 3600s.",
    evidence: [
      { key: "maxTtl", value: input.signedUrlTtlsSeconds.reduce((m, x) => Math.max(m, x), 0) },
    ],
  });

  out.push({
    id: "secret.log-sites",
    category: "SECURITY",
    title: "No secret material in logs",
    status: input.suspectLogSites.length === 0 ? "PASS" : "WARNING",
    severity: input.suspectLogSites.length === 0 ? "info" : "warning",
    detail: input.suspectLogSites.length
      ? `${input.suspectLogSites.length} log site(s) may print credentials.`
      : "No suspect logging sites found.",
  });

  return out;
}
