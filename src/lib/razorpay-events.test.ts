import { describe, expect, it } from "vitest";
import {
  SUPPORTED_RAZORPAY_EVENTS,
  decideEventOutcome,
  isSupportedEvent,
  targetStatusForEvent,
} from "./razorpay-events";

describe("Razorpay event mapping", () => {
  it("recognises every documented event", () => {
    for (const ev of SUPPORTED_RAZORPAY_EVENTS) expect(isSupportedEvent(ev)).toBe(true);
  });

  it("rejects unknown events", () => {
    expect(isSupportedEvent("subscription.frobnicated")).toBe(false);
    expect(decideEventOutcome("subscription.frobnicated", "active")).toEqual({
      action: "ignore",
      reason: "unsupported_event:subscription.frobnicated",
    });
  });

  it("maps activation events to active", () => {
    expect(targetStatusForEvent("subscription.activated")).toBe("active");
    expect(targetStatusForEvent("subscription.charged")).toBe("active");
    expect(targetStatusForEvent("invoice.paid")).toBe("active");
  });

  it("maps failure/pending events to past_due", () => {
    expect(targetStatusForEvent("payment.failed")).toBe("past_due");
    expect(targetStatusForEvent("subscription.pending")).toBe("past_due");
  });

  it("emits transition when valid", () => {
    const d = decideEventOutcome("subscription.activated", "trialing");
    expect(d).toEqual({ action: "transition", from: "trialing", to: "active" });
  });

  it("returns invalid_transition rather than forcing bad state", () => {
    // active -> incomplete is not a valid transition; a stray auth event
    // for an already-active subscription must NOT be forced.
    const d = decideEventOutcome("subscription.authenticated", "active");
    expect(d.action).toBe("invalid_transition");
  });

  it("collapses no-op events (already in target state)", () => {
    const d = decideEventOutcome("subscription.activated", "active");
    expect(d).toEqual({ action: "no_transition", from: "active" });
  });
});