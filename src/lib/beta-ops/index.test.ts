import { describe, it, expect } from "vitest";
import {
  summariseBugs,
  summariseFeedback,
  summariseCrashes,
  rateProviderStability,
  validatePayments,
  buildBetaReport,
  V1_0_1_SCOPE,
  V1_1_ROADMAP,
} from "./index";

describe("summariseBugs", () => {
  it("counts and flags critical open bugs as release-blocking", () => {
    const s = summariseBugs([
      { id: "1", title: "a", priority: "CRITICAL", status: "OPEN", owner: null, resolution: null, reportedAt: "2026-07-16T00:00:00Z" },
      { id: "2", title: "b", priority: "HIGH", status: "FIXED", owner: "x", resolution: "patched", reportedAt: "2026-07-15T00:00:00Z" },
      { id: "3", title: "c", priority: "LOW", status: "OPEN", owner: null, resolution: null, reportedAt: "2026-07-15T00:00:00Z" },
    ]);
    expect(s.total).toBe(3);
    expect(s.openCritical).toBe(1);
    expect(s.blockingRelease).toBe(true);
    expect(s.byPriority.HIGH).toBe(1);
    expect(s.byStatus.FIXED).toBe(1);
  });
  it("empty input is not blocking", () => {
    expect(summariseBugs([]).blockingRelease).toBe(false);
  });
});

describe("summariseFeedback", () => {
  it("computes averages and NPS", () => {
    const f = summariseFeedback([
      { id: "1", category: "UI", rating: 5, comment: "great", submittedAt: "2026-07-16T00:00:00Z" },
      { id: "2", category: "PERFORMANCE", rating: 2, comment: "slow", submittedAt: "2026-07-16T00:00:00Z" },
      { id: "3", category: "UI", rating: 5, comment: "nice", submittedAt: "2026-07-16T00:00:00Z" },
    ]);
    expect(f.total).toBe(3);
    expect(f.avgRating).toBeCloseTo(4);
    expect(f.byCategory.UI).toBe(2);
    expect(f.nps).toBe(Math.round(((2 - 1) / 3) * 100));
  });
});

describe("summariseCrashes", () => {
  it("tallies by kind and finds top route", () => {
    const now = new Date("2026-07-17T12:00:00Z");
    const c = summariseCrashes(
      [
        { id: "1", kind: "API_FAILURE", message: "x", occurredAt: "2026-07-17T10:00:00Z", route: "/decision" },
        { id: "2", kind: "API_FAILURE", message: "x", occurredAt: "2026-07-17T11:00:00Z", route: "/decision" },
        { id: "3", kind: "RENDER_FAILURE", message: "x", occurredAt: "2026-07-10T00:00:00Z", route: "/dashboard" },
      ],
      now,
    );
    expect(c.total).toBe(3);
    expect(c.byKind.API_FAILURE).toBe(2);
    expect(c.last24h).toBe(2);
    expect(c.topRoute).toBe("/decision");
  });
});

describe("rateProviderStability", () => {
  it("classifies error rates", () => {
    const rows = rateProviderStability([
      { providerId: "a", label: "A", successes: 100, failures: 0, p50LatencyMs: 100 },
      { providerId: "b", label: "B", successes: 96, failures: 4, p50LatencyMs: 200 },
      { providerId: "c", label: "C", successes: 80, failures: 20, p50LatencyMs: 300 },
    ]);
    expect(rows[0].rating).toBe("HEALTHY");
    expect(rows[1].rating).toBe("DEGRADED");
    expect(rows[2].rating).toBe("UNSTABLE");
  });
});

describe("validatePayments", () => {
  it("marks healthy when failures/refunds low and invoicing high", () => {
    const r = validatePayments({ subscriptions: 100, renewals: 90, failures: 5, refunds: 2, invoicesIssued: 100 });
    expect(r.healthy).toBe(true);
    expect(r.invoiceCoverage).toBe(1);
  });
  it("flags unhealthy on high failure rate", () => {
    const r = validatePayments({ subscriptions: 100, renewals: 50, failures: 40, refunds: 1, invoicesIssued: 100 });
    expect(r.healthy).toBe(false);
  });
});

describe("buildBetaReport", () => {
  it("recommends HOLD when critical bugs are open", () => {
    const r = buildBetaReport({
      bugs: [{ id: "1", title: "a", priority: "CRITICAL", status: "OPEN", owner: null, resolution: null, reportedAt: "2026-07-16T00:00:00Z" }],
      feedback: [],
      crashes: [],
      providers: [],
      payments: { subscriptions: 10, renewals: 10, failures: 0, refunds: 0, invoicesIssued: 10 },
    });
    expect(r.recommendation).toBe("HOLD");
    expect(r.v101).toBe(V1_0_1_SCOPE);
    expect(r.v11).toBe(V1_1_ROADMAP);
  });
  it("recommends PROMOTE when everything is healthy", () => {
    const r = buildBetaReport({
      bugs: [],
      feedback: [],
      crashes: [],
      providers: [{ providerId: "a", label: "A", successes: 100, failures: 0, p50LatencyMs: 50 }],
      payments: { subscriptions: 10, renewals: 10, failures: 0, refunds: 0, invoicesIssued: 10 },
    });
    expect(r.recommendation).toBe("PROMOTE");
  });
});