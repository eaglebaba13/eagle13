/**
 * Phase 25 — Stage 2 — Staging configuration validator.
 * Pure. Never emits secret values.
 */
import type { StagingCheck } from "./staging-validation-types";
import { redactSecretLike } from "../production-readiness-types";

export interface StagingConfigInput {
  baseUrl: string | null;
  environment: string | null;
  buildVersion: string | null;
  commitVersion: string | null;
  supabaseProject: string | null;
  hasTestUsers: boolean;
  hasAdminTestUser: boolean;
  providerTestMode: boolean;
  maxDurationMs: number;
  requestTimeoutMs: number;
  allowedHosts: readonly string[];
  productionApproved: boolean;
  expectedBuildVersion?: string | null;
  expectedEnvironment?: string | null;
}

export interface StagingConfigResolution {
  ok: boolean;
  host: string | null;
  checks: readonly StagingCheck[];
}

const LOCALHOST_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

function parseHost(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

function looksLikeProduction(host: string): boolean {
  // Reject naked production apex or "www." variants unless allow-listed.
  return /^(www\.)?[^-]+\.(com|io|app|co|net|org)$/i.test(host) && !host.includes("staging");
}

export function validateStagingConfig(input: StagingConfigInput): StagingConfigResolution {
  const checks: StagingCheck[] = [];
  const host = parseHost(input.baseUrl);

  if (!host) {
    checks.push({
      id: "config.base_url_missing",
      category: "GOVERNANCE",
      title: "Staging base URL",
      status: "FAIL",
      severity: "blocker",
      detail: "Staging base URL is missing or invalid.",
      remediation: "Set STAGING_BASE_URL to a full https:// URL of the staging deployment.",
      hardBlocker: true,
    });
    return { ok: false, host: null, checks };
  }

  if (LOCALHOST_HOSTS.has(host)) {
    checks.push({
      id: "config.localhost_rejected",
      category: "GOVERNANCE",
      title: "Localhost is not a staging host",
      status: "FAIL",
      severity: "blocker",
      detail: `Refusing to validate against localhost (${redactSecretLike(host)}).`,
      hardBlocker: true,
    });
    return { ok: false, host, checks };
  }

  const allowed = input.allowedHosts.map((h) => h.toLowerCase());
  const hostAllowed = allowed.length === 0 ? true : allowed.some((h) => host === h || host.endsWith(`.${h}`));
  if (!hostAllowed) {
    checks.push({
      id: "config.host_not_allowlisted",
      category: "GOVERNANCE",
      title: "Staging host is not on the allow list",
      status: "FAIL",
      severity: "blocker",
      detail: `Host ${redactSecretLike(host)} is not in allowedHosts.`,
      hardBlocker: true,
    });
  }

  if (looksLikeProduction(host) && !input.productionApproved) {
    checks.push({
      id: "host.production_without_approval",
      category: "GOVERNANCE",
      title: "Production host targeted without approval",
      status: "FAIL",
      severity: "blocker",
      detail: "The configured host looks like production; explicit approval required.",
      hardBlocker: true,
    });
  }

  if (!input.buildVersion) {
    checks.push({
      id: "config.build_missing",
      category: "GOVERNANCE",
      title: "Build/version identifier missing",
      status: "FAIL",
      severity: "critical",
      detail: "Deployed build identifier could not be read.",
    });
  } else if (input.expectedBuildVersion && input.expectedBuildVersion !== input.buildVersion) {
    checks.push({
      id: "build.version_mismatch",
      category: "BUILD",
      title: "Deployed build does not match expected build",
      status: "FAIL",
      severity: "blocker",
      detail: `expected=${redactSecretLike(input.expectedBuildVersion)} deployed=${redactSecretLike(input.buildVersion)}`,
      hardBlocker: true,
    });
  } else {
    checks.push({
      id: "config.build_present",
      category: "GOVERNANCE",
      title: "Deployed build identifier present",
      status: "PASS",
      severity: "info",
    });
  }

  if (input.expectedEnvironment && input.environment && input.expectedEnvironment !== input.environment) {
    checks.push({
      id: "config.env_mismatch",
      category: "GOVERNANCE",
      title: "Environment mismatch",
      status: "FAIL",
      severity: "critical",
      detail: `expected=${input.expectedEnvironment} actual=${input.environment}`,
    });
  }

  if (!input.hasTestUsers || !input.hasAdminTestUser) {
    checks.push({
      id: "config.test_users_missing",
      category: "GOVERNANCE",
      title: "Test-user provisioning incomplete",
      status: "WARNING",
      severity: "warning",
      detail: "Journeys will be SKIPPED without a full set of test users.",
    });
  }

  const ok = checks.every((c) => c.status !== "FAIL");
  return { ok, host, checks };
}

export const DEFAULT_ALLOWED_HOSTS: readonly string[] = [
  "lovable.app",
  "lovable.dev",
];