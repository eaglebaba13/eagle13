import { beforeEach, describe, expect, it } from "vitest";
import { recordSaasEvent, snapshotSaasEvents, resetSaasEvents, summariseSaas, SAAS_ANALYTICS_VERSION } from "./index";

describe("saas-analytics", () => {
  beforeEach(() => resetSaasEvents());

  it("records and snapshots events", () => {
    recordSaasEvent({ kind: "dau.ping", userId: "u1", plan: "pro", detail: null, timestampMs: 1 });
    recordSaasEvent({ kind: "subscription.started", userId: "u2", plan: "pro", detail: null, timestampMs: 2 });
    expect(snapshotSaasEvents()).toHaveLength(2);
  });

  it("summarises counts and unique users", () => {
    recordSaasEvent({ kind: "dau.ping", userId: "u1", plan: "pro", detail: null, timestampMs: 1 });
    recordSaasEvent({ kind: "dau.ping", userId: "u1", plan: "pro", detail: null, timestampMs: 2 });
    recordSaasEvent({ kind: "feature.used", userId: "u2", plan: "professional", detail: "combined-pcr", timestampMs: 3 });
    recordSaasEvent({ kind: "error.reported", userId: null, plan: null, detail: "boom", timestampMs: 4 });
    const s = summariseSaas();
    expect(s.total).toBe(4);
    expect(s.byKind["dau.ping"]).toBe(2);
    expect(s.byKind["feature.used"]).toBe(1);
    expect(s.uniqueUsers).toBe(2);
    expect(s.errors).toBe(1);
  });

  it("caps ring at 1000 entries", () => {
    for (let i = 0; i < 1200; i++) {
      recordSaasEvent({ kind: "dau.ping", userId: `u${i}`, plan: "pro", detail: null, timestampMs: i });
    }
    expect(snapshotSaasEvents().length).toBeLessThanOrEqual(1000);
  });

  it("version stable", () => {
    expect(SAAS_ANALYTICS_VERSION).toBe("saas-analytics@1.0.0");
  });
});