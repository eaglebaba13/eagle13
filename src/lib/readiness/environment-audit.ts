/**
 * Phase 25 — Environment variable audit (pure logic).
 *
 * Given a redacted env presence map, produces `ReadinessResult`s. Reading
 * `process.env` happens in `environment-audit.server.ts` — this file NEVER
 * touches raw secret values.
 */
import type {
  ReadinessCategory,
  ReadinessResult,
  ReadinessSeverity,
} from "./production-readiness-types";

export type EnvPresence = {
  name: string;
  status: "PRESENT" | "MISSING" | "INVALID_FORMAT" | "PLACEHOLDER";
  category: "core" | "market" | "payments" | "email" | "security" | "misc";
  required: boolean;
  lastFour?: string; // only ever last 4 chars, never the full value
};

export interface EnvironmentAuditInput {
  environment: "development" | "staging" | "production" | "unknown";
  appUrl: string | null;
  vars: readonly EnvPresence[];
  /** True when the paid-plan surface is enabled for this deployment. */
  paidPlansEnabled: boolean;
}

const PLACEHOLDER_PATTERNS = [
  /^changeme/i,
  /^replace/i,
  /^placeholder/i,
  /^example/i,
  /^your[-_]/i,
  /^xxx+$/i,
  /^0000+$/i,
  /^test[-_]?key$/i,
];

export function isPlaceholderValue(value: string): boolean {
  return PLACEHOLDER_PATTERNS.some((p) => p.test(value));
}

const CATEGORY_MAP: Record<EnvPresence["category"], ReadinessCategory> = {
  core: "SECURITY",
  market: "PROVIDERS",
  payments: "PAYMENTS",
  email: "OPERATIONS",
  security: "SECURITY",
  misc: "OPERATIONS",
};

export function auditEnvironment(input: EnvironmentAuditInput): ReadinessResult[] {
  const out: ReadinessResult[] = [];

  // Insecure localhost app URL in production
  if (input.environment === "production" && input.appUrl) {
    const insecure =
      /^http:\/\//i.test(input.appUrl) || /localhost|127\.0\.0\.1/i.test(input.appUrl);
    out.push({
      id: "env.app-url",
      category: "SECURITY",
      title: "Application URL",
      status: insecure ? "FAIL" : "PASS",
      severity: insecure ? "blocker" : "info",
      hardBlocker: insecure,
      detail: insecure
        ? "Production is configured with an insecure/localhost URL."
        : "Application URL is https and non-local.",
      remediation: insecure
        ? "Set the production application URL to an https public domain."
        : undefined,
      evidence: [{ key: "appUrl.scheme", value: /^https/i.test(input.appUrl) ? "https" : "http" }],
    });
  }

  for (const v of input.vars) {
    const severity: ReadinessSeverity = v.required ? "critical" : "warning";
    if (v.status === "PRESENT") {
      out.push({
        id: `env.${v.name}`,
        category: CATEGORY_MAP[v.category],
        title: `Env: ${v.name}`,
        status: "PASS",
        severity: "info",
        evidence: v.lastFour
          ? [{ key: "lastFour", value: `…${v.lastFour}` }]
          : undefined,
      });
      continue;
    }
    if (v.status === "PLACEHOLDER") {
      out.push({
        id: `env.${v.name}`,
        category: CATEGORY_MAP[v.category],
        title: `Env: ${v.name}`,
        status: "FAIL",
        severity: v.required ? "blocker" : severity,
        hardBlocker: v.required && input.environment === "production",
        detail: `${v.name} is set to a placeholder/example value.`,
        remediation: `Set ${v.name} to a real value.`,
      });
      continue;
    }
    if (v.status === "INVALID_FORMAT") {
      out.push({
        id: `env.${v.name}`,
        category: CATEGORY_MAP[v.category],
        title: `Env: ${v.name}`,
        status: "FAIL",
        severity,
        hardBlocker: v.required && input.environment === "production",
        detail: `${v.name} value fails shape validation.`,
      });
      continue;
    }
    // MISSING
    out.push({
      id: `env.${v.name}`,
      category: CATEGORY_MAP[v.category],
      title: `Env: ${v.name}`,
      status: "MISSING",
      severity: v.required ? "blocker" : "warning",
      hardBlocker: v.required && input.environment === "production",
      detail: `${v.name} is not configured.`,
      remediation: v.required
        ? `Add ${v.name} before promoting to production.`
        : undefined,
    });
  }

  // Payment env blocker: if paid plans enabled and any payments env is missing.
  if (input.paidPlansEnabled) {
    const paymentMissing = input.vars.filter(
      (v) => v.category === "payments" && v.required && v.status !== "PRESENT",
    );
    if (paymentMissing.length > 0) {
      out.push({
        id: "env.payments.aggregate",
        category: "PAYMENTS",
        title: "Payments env aggregate",
        status: "FAIL",
        severity: "blocker",
        hardBlocker: true,
        detail: `Paid plans are enabled but ${paymentMissing.length} required payment env var(s) are missing/invalid.`,
        remediation: "Configure all MANUAL_UPI_* env vars before enabling paid plans.",
      });
    }
  }

  return out;
}

export const CORE_REQUIRED_ENV = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
] as const;

export const PAYMENT_REQUIRED_ENV = [
  "MANUAL_UPI_ID",
  "MANUAL_UPI_PAYEE",
] as const;

export const PAYMENT_OPTIONAL_ENV = [
  "MANUAL_UPI_BANK",
  "MANUAL_UPI_SUPPORT_EMAIL",
  "MANUAL_UPI_SUPPORT_PHONE",
  "MANUAL_UPI_QR_IMAGE_URL",
] as const;
