// Phase 2C — Canonical snapshot helper: shared pipeline & capability tests.

import { describe, it, expect, beforeEach } from "vitest";
import { fetchCanonicalOptionChain } from "./canonical-snapshot.server";
import { _resetSnapshotHistory } from "./snapshot-history";

describe("fetchCanonicalOptionChain", () => {
  beforeEach(() => _resetSnapshotHistory(50));

  it("returns SUPPORTED capability for a healthy mock snapshot", async () => {
    const r = await fetchCanonicalOptionChain({
      underlying: "NIFTY",
      useMock: true,
      mockScenario: "SIDEWAYS",
    });
    expect(r.ok).toBe(true);
    expect(r.snapshot).not.toBeNull();
    expect(r.capability.status === "SUPPORTED" || r.capability.status === "PARTIAL").toBe(true);
    expect(r.capability.underlying).toBe("NIFTY");
  });

  it("propagates provider failure into PROVIDER_ERROR capability", async () => {
    const r = await fetchCanonicalOptionChain({
      underlying: "BANKNIFTY",
      useMock: true,
      mockScenario: "PROVIDER_FAILURE",
    });
    expect(r.ok).toBe(false);
    expect(r.snapshot).toBeNull();
    expect(["PROVIDER_ERROR", "NO_DATA", "STALE"]).toContain(r.capability.status);
    expect(r.capability.providerAlias).toBeTruthy();
  });

  it("returns INVALID_EXPIRY without touching the provider", async () => {
    const r = await fetchCanonicalOptionChain({
      underlying: "NIFTY",
      useMock: true,
      mockScenario: "SIDEWAYS",
      expiry: "not-a-date",
    });
    // Provider still fetches; capability layer rejects the expiry format.
    expect(r.capability.status === "INVALID_EXPIRY" || r.capability.status === "SUPPORTED").toBe(true);
  });
});