import { describe, expect, it } from "vitest";
import {
  runProviderChain,
  summariseChain,
  DEFAULT_PROVIDER_PRIORITY,
  PROVIDER_CHAIN_VERSION,
  type ProviderFetcher,
} from "./index";

function fetcher(
  id: "UPSTOX" | "INDSTOCKS" | "SHOONYA" | "ANGEL",
  ok: boolean,
  data: string | null = null,
  err: string | null = null,
): ProviderFetcher<string> {
  return {
    id,
    fetch: async () => ({ ok, data, latencyMs: 10, safeError: err }),
  };
}

describe("provider-failover", () => {
  it("primary success returns PRIMARY_OK", async () => {
    const r = await runProviderChain([fetcher("UPSTOX", true, "x")]);
    expect(r.state).toBe("PRIMARY_OK");
    expect(r.data).toBe("x");
    expect(r.provider).toBe("UPSTOX");
  });

  it("falls over to secondary when primary fails", async () => {
    const r = await runProviderChain([
      fetcher("UPSTOX", false, null, "timeout"),
      fetcher("INDSTOCKS", true, "y"),
    ]);
    expect(r.state).toBe("FAILOVER_OK");
    expect(r.provider).toBe("INDSTOCKS");
    expect(r.warnings).toContain("UPSTOX:timeout");
  });

  it("returns DEGRADED with null data when all providers fail — no fabrication", async () => {
    const r = await runProviderChain([
      fetcher("UPSTOX", false, null, "e1"),
      fetcher("INDSTOCKS", false, null, "e2"),
    ]);
    expect(r.state).toBe("DEGRADED");
    expect(r.data).toBeNull();
    expect(r.provider).toBeNull();
    expect(r.attempts).toHaveLength(2);
  });

  it("handles thrown errors without crashing", async () => {
    const throwing: ProviderFetcher<string> = {
      id: "UPSTOX",
      fetch: async () => { throw new Error("boom"); },
    };
    const r = await runProviderChain([throwing, fetcher("INDSTOCKS", true, "z")]);
    expect(r.state).toBe("FAILOVER_OK");
    expect(r.attempts[0].ok).toBe(false);
    expect(r.attempts[0].safeError).toBe("boom");
  });

  it("summarise reports primary and used providers", async () => {
    const r = await runProviderChain([
      fetcher("UPSTOX", false, null, "e"),
      fetcher("INDSTOCKS", true, "ok"),
    ]);
    const s = summariseChain(r);
    expect(s.primary).toBe("UPSTOX");
    expect(s.used).toBe("INDSTOCKS");
    expect(s.failedProviders).toEqual(["UPSTOX"]);
  });

  it("default priority starts with UPSTOX", () => {
    expect(DEFAULT_PROVIDER_PRIORITY[0]).toBe("UPSTOX");
  });

  it("formula version is stable", () => {
    expect(PROVIDER_CHAIN_VERSION).toBe("provider-failover@1.0.0");
  });
});