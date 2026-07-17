import { describe, it, expect } from "vitest";
// The full server function requires the auth middleware runtime; here we
// verify the query-key contract and re-export shape so consumers stay in
// sync and never issue duplicate requests.
import { GTI_SUMMARY_QUERY_KEY } from "@/components/dashboard/GtiSummaryCard";

describe("gti-summary contract", () => {
  it("exposes a stable shared query key", () => {
    expect(GTI_SUMMARY_QUERY_KEY).toEqual(["gti-summary"]);
  });
});