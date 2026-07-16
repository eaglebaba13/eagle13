import { describe, it, expect, beforeEach } from "vitest";
import { _resetOptionChainProviders, getOptionChainProvider, listOptionChainProviders, registerOptionChainProvider } from "./provider";
import { MockOptionChainProvider } from "./mock-provider";

describe("provider registry", () => {
  beforeEach(() => _resetOptionChainProviders());
  it("registers and retrieves", () => {
    registerOptionChainProvider(new MockOptionChainProvider());
    expect(listOptionChainProviders()).toContain("MOCK");
    expect(getOptionChainProvider("MOCK")?.id).toBe("MOCK");
  });
  it("returns null for unknown", () => {
    expect(getOptionChainProvider("NOPE")).toBeNull();
  });
});