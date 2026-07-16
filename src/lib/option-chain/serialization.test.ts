import { describe, it, expect } from "vitest";
import { MockOptionChainProvider } from "./mock-provider";

describe("snapshot serialization", () => {
  it("round-trips through JSON", async () => {
    const p = new MockOptionChainProvider({ scenario: "BULLISH" });
    const r = await p.fetchSnapshot({ underlying: "NIFTY" });
    const json = JSON.stringify(r.snapshot);
    const back = JSON.parse(json);
    expect(back.instrument).toBe("NIFTY");
    expect(back.strikes.length).toBe(r.snapshot!.strikes.length);
  });
});