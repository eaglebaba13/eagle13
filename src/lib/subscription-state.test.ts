import { describe, it, expect } from "vitest";
import { isValidTransition } from "./subscription-state";

describe("subscription state machine", () => {
  it("allows same-state no-op", () => {
    expect(isValidTransition("active", "active")).toBe(true);
  });
  it("accepts valid transitions", () => {
    expect(isValidTransition("trialing", "active")).toBe(true);
    expect(isValidTransition("active", "past_due")).toBe(true);
    expect(isValidTransition("past_due", "active")).toBe(true);
    expect(isValidTransition("canceled", "expired")).toBe(true);
    expect(isValidTransition("expired", "active")).toBe(true);
  });
  it("rejects invalid transitions", () => {
    expect(isValidTransition("expired", "trialing")).toBe(false);
    expect(isValidTransition("free" as never, "active")).toBe(false);
    expect(isValidTransition("suspended", "trialing")).toBe(false);
    expect(isValidTransition("active", "trialing")).toBe(false);
  });
});