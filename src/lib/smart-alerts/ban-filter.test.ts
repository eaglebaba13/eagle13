import { describe, expect, it } from "vitest";
import { filterFoAlertCandidates, isVerifiedFoAlertEligible } from "./ban-filter";
import { parseCombinedOi } from "../market-data/mwpl.server";

describe("F&O alert ban filter", () => {
  it("excludes banned and near-ban aliases before ranking", () => {
    const stocks = ["BANNED", "NEAR_BAN", "IN_BAN", "UPCOMING_BAN", "NORMAL"].map((foBanStatus) => ({
      foBanStatus, verifiedLive: true, asOfTimestamp: new Date().toISOString(), mwplPercent: 79,
    }));
    expect(filterFoAlertCandidates(stocks)).toEqual([stocks[4]]);
    expect(filterFoAlertCandidates([{ foBanStatus: undefined }])).toEqual([]);
  });

  it("rejects near-ban, ban, stale, and unverified records", () => {
    const now = Date.parse("2026-11-19T10:00:00Z");
    const record = { status: "NORMAL", verifiedLive: true, asOfTimestamp: new Date(now).toISOString() };
    expect(isVerifiedFoAlertEligible({ ...record, mwplPercent: 79.99 }, now)).toBe(true);
    for (const mwplPercent of [80, 94.99, 95]) {
      expect(isVerifiedFoAlertEligible({ ...record, mwplPercent }, now)).toBe(false);
    }
    expect(isVerifiedFoAlertEligible({ ...record, mwplPercent: 79, verifiedLive: false }, now)).toBe(false);
    expect(isVerifiedFoAlertEligible({ ...record, mwplPercent: 79 }, now + 120_000)).toBe(false);
  });

  it("uses the dated exchange ratio and rejects stale or invalid rows", () => {
    const csv = [
      '19-NOV-2026,INE123456789,"Sample, Ltd",SAMPLE,1000,800',
      "18-NOV-2026,INE123456789,Old,OLD,1000,950",
      "19-NOV-2026,INE123456789,Invalid,INVALID,0,950",
    ].join("\n");
    expect([...parseCombinedOi(csv, "19-NOV-2026")]).toEqual([["SAMPLE", 80]]);
  });
});
