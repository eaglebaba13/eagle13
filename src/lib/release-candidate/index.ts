// Phase 32 · Release Candidate metadata + verdict composer.
//
// Wraps the Phase-30/31 staging verdict into a production release-
// candidate record. Never emits READY_FOR_PUBLIC automatically — public
// promotion requires an explicit human approver.

export type StagingVerdict =
  | "NOT_READY"
  | "READY_FOR_INTERNAL_STAGING"
  | "READY_FOR_BETA"
  | "READY_FOR_PRODUCTION_SIGNOFF";

export interface HardBlocker {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
}

export interface StagingValidationInput {
  readonly configured: boolean;
  readonly mockDataOnSubscriptionPath: boolean;
  readonly providerTokenExpired: boolean;
  readonly optionChainInvalid: boolean;
  readonly pcrStale: boolean;
  readonly authBroken: boolean;
  readonly billingWebhookBroken: boolean;
  readonly brokerExecutionEnabled: boolean;
  readonly rollbackMissing: boolean;
  readonly manualSignoffMissing: boolean;
  readonly warnings: number;
  readonly failures: number;
  readonly passes: number;
}

export interface StagingReport {
  readonly verdict: StagingVerdict;
  readonly hardBlockers: readonly HardBlocker[];
  readonly score: number;
  readonly passes: number;
  readonly warnings: number;
  readonly failures: number;
}

const HARD_BLOCKER_MAP: Array<{
  key: keyof StagingValidationInput;
  id: string;
  title: string;
  detail: string;
}> = [
  { key: "mockDataOnSubscriptionPath", id: "mock.subscription", title: "Mock data on subscription path", detail: "Subscription-facing route serves mock data" },
  { key: "providerTokenExpired", id: "provider.token", title: "Provider token expired", detail: "Live provider auth token expired" },
  { key: "optionChainInvalid", id: "options.invalid", title: "Invalid option chain", detail: "Live option chain failed validation" },
  { key: "pcrStale", id: "pcr.stale", title: "PCR stale", detail: "Combined PCR pipeline stale" },
  { key: "authBroken", id: "auth.broken", title: "Auth broken", detail: "Auth end-to-end journey failing" },
  { key: "billingWebhookBroken", id: "billing.webhook", title: "Billing webhook signature verification broken", detail: "Razorpay/Stripe webhook signature check failing" },
  { key: "brokerExecutionEnabled", id: "broker.execution", title: "Broker execution enabled", detail: "Order execution path is enabled — must remain disabled" },
  { key: "rollbackMissing", id: "release.rollback", title: "Rollback plan missing", detail: "No rollback plan configured for release" },
  { key: "manualSignoffMissing", id: "release.signoff", title: "Manual sign-off missing", detail: "Human approver has not signed off" },
];

export function computeStagingReport(input: StagingValidationInput): StagingReport {
  if (!input.configured) {
    return {
      verdict: "NOT_READY",
      hardBlockers: [
        { id: "staging.unconfigured", title: "Staging not configured", detail: "Staging environment is not configured" },
      ],
      score: 0,
      passes: 0,
      warnings: 0,
      failures: 0,
    };
  }
  const blockers: HardBlocker[] = [];
  for (const b of HARD_BLOCKER_MAP) {
    if (input[b.key] === true) blockers.push({ id: b.id, title: b.title, detail: b.detail });
  }
  const total = Math.max(1, input.passes + input.warnings + input.failures);
  const score = Math.round(((input.passes + input.warnings * 0.5) / total) * 100);

  let verdict: StagingVerdict;
  if (blockers.length > 0 || input.failures > 0) verdict = "NOT_READY";
  else if (input.warnings > 0 && score < 90) verdict = "READY_FOR_INTERNAL_STAGING";
  else if (score < 100) verdict = "READY_FOR_BETA";
  else verdict = "READY_FOR_PRODUCTION_SIGNOFF";

  return { verdict, hardBlockers: blockers, score, passes: input.passes, warnings: input.warnings, failures: input.failures };
}

export interface ReleaseCandidateInput {
  readonly version: string;
  readonly gitCommit: string;
  readonly buildTimestamp: string;
  readonly migrationStatus: "APPLIED" | "PENDING" | "FAILED" | "NONE";
  readonly testCount: number;
  readonly staging: StagingReport;
  readonly knownLimitations: readonly string[];
  readonly rollbackVersion: string | null;
  readonly manualApprover: string | null;
  readonly approvalTimestamp: string | null;
}

export type ReleaseCandidateVerdict =
  | "BLOCKED"
  | "STAGING_HOLD"
  | "AWAITING_SIGNOFF"
  | "APPROVED_INTERNAL"
  | "APPROVED_BETA"
  | "APPROVED_PRODUCTION";

export interface ReleaseCandidate extends ReleaseCandidateInput {
  readonly verdict: ReleaseCandidateVerdict;
  readonly readyForPublic: false; // never auto-emits READY_FOR_PUBLIC
  readonly notes: readonly string[];
}

export function composeReleaseCandidate(input: ReleaseCandidateInput): ReleaseCandidate {
  const notes: string[] = [];
  let verdict: ReleaseCandidateVerdict;
  if (input.staging.hardBlockers.length > 0) {
    verdict = "BLOCKED";
    notes.push(`Blocked by ${input.staging.hardBlockers.length} hard blocker(s)`);
  } else if (input.staging.verdict === "NOT_READY") {
    verdict = "BLOCKED";
    notes.push("Staging NOT_READY");
  } else if (input.staging.verdict === "READY_FOR_INTERNAL_STAGING") {
    verdict = "APPROVED_INTERNAL";
  } else if (input.staging.verdict === "READY_FOR_BETA") {
    verdict = "APPROVED_BETA";
  } else if (!input.rollbackVersion) {
    verdict = "STAGING_HOLD";
    notes.push("Rollback version required for production sign-off");
  } else if (!input.manualApprover || !input.approvalTimestamp) {
    verdict = "AWAITING_SIGNOFF";
    notes.push("Manual human approver required");
  } else {
    verdict = "APPROVED_PRODUCTION";
  }
  if (input.migrationStatus === "FAILED") {
    verdict = "BLOCKED";
    notes.push("Migration failed");
  }
  if (input.migrationStatus === "PENDING" && verdict !== "BLOCKED") {
    notes.push("Pending migrations must be applied before public release");
  }
  return { ...input, verdict, readyForPublic: false, notes };
}