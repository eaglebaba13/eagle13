import { describe, it, expect } from "vitest";
import { deriveConfidence } from "./confidence";
import type { GannGapConfirmation } from "./types";

function mk(alignment: GannGapConfirmation["alignment"]): GannGapConfirmation {
  return { id: alignment, label: alignment, alignment, detail: "" };
}

describe("deriveConfidence stale-input downgrade", () => {
  const strong: GannGapConfirmation[] = [mk("SUPPORTS_UP"), mk("SUPPORTS_UP"), mk("SUPPORTS_UP")];
  it("HIGH when fresh", () => {
    expect(deriveConfidence(strong, "SUPPORTS_UP")).toBe("EXPERIMENTAL_HIGH");
  });
  it("HIGH → MEDIUM when stale", () => {
    expect(deriveConfidence(strong, "SUPPORTS_UP", { staleInputs: true })).toBe("EXPERIMENTAL_MEDIUM");
  });
  it("MEDIUM → LOW when stale", () => {
    const mid = [mk("SUPPORTS_UP"), mk("SUPPORTS_UP"), mk("CONFLICT")];
    expect(deriveConfidence(mid, "SUPPORTS_UP")).toBe("EXPERIMENTAL_MEDIUM");
    expect(deriveConfidence(mid, "SUPPORTS_UP", { staleInputs: true })).toBe("EXPERIMENTAL_LOW");
  });
});