import { describe, expect, it } from "vitest";
import {
  computeVerificationReport,
  defaultVerificationReport,
  DEFAULT_CHECKLIST,
  type ChecklistItem,
} from "./index";

const baseInput = {
  items: [
    { id: "a", category: "Platform", title: "t", status: "PASS" },
    { id: "b", category: "Platform", title: "t", status: "PASS" },
  ] satisfies ChecklistItem[],
  brokerExecutionEnabled: false,
  mockDataPresent: false,
  researchFormulaChanged: false,
  manualApprover: "ops@example.com" as string | null,
  rollbackReady: true,
};

describe("computeVerificationReport", () => {
  it("returns READY_FOR_PRODUCTION when all pass with approver + rollback", () => {
    const r = computeVerificationReport(baseInput);
    expect(r.verdict).toBe("READY_FOR_PRODUCTION");
    expect(r.counts).toEqual({ pass: 2, partial: 0, fail: 0, total: 2 });
    expect(r.score).toBe(100);
  });

  it("BLOCKED when broker execution enabled", () => {
    const r = computeVerificationReport({ ...baseInput, brokerExecutionEnabled: true });
    expect(r.verdict).toBe("BLOCKED");
    expect(r.blockers[0]).toMatch(/Broker execution/);
  });

  it("BLOCKED when any FAIL item present", () => {
    const r = computeVerificationReport({
      ...baseInput,
      items: [{ id: "x", category: "Security", title: "RLS", status: "FAIL" }],
    });
    expect(r.verdict).toBe("BLOCKED");
  });

  it("READY_FOR_OPEN_BETA when passes but no approver", () => {
    const r = computeVerificationReport({ ...baseInput, manualApprover: null });
    expect(r.verdict).toBe("READY_FOR_OPEN_BETA");
  });

  it("READY_FOR_CLOSED_BETA on partials with mid score", () => {
    const items: ChecklistItem[] = Array.from({ length: 10 }, (_, i) => ({
      id: `i${i}`, category: "Platform", title: "t",
      status: i < 8 ? "PASS" : "PARTIAL",
    }));
    const r = computeVerificationReport({ ...baseInput, items });
    expect(r.verdict).toBe("READY_FOR_CLOSED_BETA");
  });

  it("READY_FOR_INTERNAL_BETA on many partials with low score", () => {
    const items: ChecklistItem[] = Array.from({ length: 10 }, (_, i) => ({
      id: `i${i}`, category: "Platform", title: "t",
      status: i < 3 ? "PASS" : "PARTIAL",
    }));
    const r = computeVerificationReport({ ...baseInput, items });
    expect(r.verdict).toBe("READY_FOR_INTERNAL_BETA");
  });

  it("BLOCKED when research formula changes flagged", () => {
    const r = computeVerificationReport({ ...baseInput, researchFormulaChanged: true });
    expect(r.verdict).toBe("BLOCKED");
  });

  it("default checklist yields at least READY_FOR_OPEN_BETA (no approver by default)", () => {
    const r = defaultVerificationReport();
    expect(["READY_FOR_OPEN_BETA", "READY_FOR_CLOSED_BETA"]).toContain(r.verdict);
    expect(r.items.length).toBe(DEFAULT_CHECKLIST.length);
  });
});