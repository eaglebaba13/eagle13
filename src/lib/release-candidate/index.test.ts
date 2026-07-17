import { describe, expect, it } from "vitest";
import {
  composeReleaseCandidate,
  computeStagingReport,
  type StagingValidationInput,
} from "./index";

const baseInput: StagingValidationInput = {
  configured: true,
  mockDataOnSubscriptionPath: false,
  providerTokenExpired: false,
  optionChainInvalid: false,
  pcrStale: false,
  authBroken: false,
  billingWebhookBroken: false,
  brokerExecutionEnabled: false,
  rollbackMissing: false,
  manualSignoffMissing: false,
  warnings: 0,
  failures: 0,
  passes: 25,
};

describe("computeStagingReport", () => {
  it("returns NOT_READY when staging not configured", () => {
    const r = computeStagingReport({ ...baseInput, configured: false });
    expect(r.verdict).toBe("NOT_READY");
    expect(r.hardBlockers[0].id).toBe("staging.unconfigured");
  });

  it("flags broker execution as hard blocker", () => {
    const r = computeStagingReport({ ...baseInput, brokerExecutionEnabled: true });
    expect(r.verdict).toBe("NOT_READY");
    expect(r.hardBlockers.some((b) => b.id === "broker.execution")).toBe(true);
  });

  it("returns READY_FOR_PRODUCTION_SIGNOFF for perfect run", () => {
    const r = computeStagingReport(baseInput);
    expect(r.verdict).toBe("READY_FOR_PRODUCTION_SIGNOFF");
    expect(r.score).toBe(100);
  });

  it("returns READY_FOR_BETA when warnings but score >=90", () => {
    const r = computeStagingReport({ ...baseInput, passes: 90, warnings: 5 });
    expect(r.verdict).toBe("READY_FOR_BETA");
  });

  it("returns READY_FOR_INTERNAL_STAGING when warnings drag score below 90", () => {
    const r = computeStagingReport({ ...baseInput, passes: 5, warnings: 5 });
    expect(r.verdict).toBe("READY_FOR_INTERNAL_STAGING");
  });
});

describe("composeReleaseCandidate", () => {
  const staging = computeStagingReport(baseInput);
  const rcBase = {
    version: "1.0.0",
    gitCommit: "abc123",
    buildTimestamp: "2026-07-17T10:00:00Z",
    migrationStatus: "APPLIED" as const,
    testCount: 1754,
    staging,
    knownLimitations: ["Historical accuracy not yet populated"],
    rollbackVersion: "0.9.9",
    manualApprover: "ops@example.com",
    approvalTimestamp: "2026-07-17T10:30:00Z",
  };

  it("APPROVED_PRODUCTION when signoff + rollback present", () => {
    const rc = composeReleaseCandidate(rcBase);
    expect(rc.verdict).toBe("APPROVED_PRODUCTION");
    expect(rc.readyForPublic).toBe(false);
  });

  it("AWAITING_SIGNOFF when approver missing", () => {
    const rc = composeReleaseCandidate({ ...rcBase, manualApprover: null });
    expect(rc.verdict).toBe("AWAITING_SIGNOFF");
  });

  it("STAGING_HOLD when rollback missing", () => {
    const rc = composeReleaseCandidate({ ...rcBase, rollbackVersion: null });
    expect(rc.verdict).toBe("STAGING_HOLD");
  });

  it("BLOCKED when hard blocker present", () => {
    const blocked = computeStagingReport({ ...baseInput, brokerExecutionEnabled: true });
    const rc = composeReleaseCandidate({ ...rcBase, staging: blocked });
    expect(rc.verdict).toBe("BLOCKED");
  });

  it("BLOCKED on failed migration", () => {
    const rc = composeReleaseCandidate({ ...rcBase, migrationStatus: "FAILED" });
    expect(rc.verdict).toBe("BLOCKED");
  });

  it("never emits READY_FOR_PUBLIC automatically", () => {
    const rc = composeReleaseCandidate(rcBase);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((rc as any).readyForPublic).toBe(false);
  });
});