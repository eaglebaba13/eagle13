/**
 * Phase 20.3B — Deterministic mapping between Razorpay webhook events and
 * EagleBABA internal subscription-state transitions.
 *
 * Pure module: no I/O, no secrets, no provider SDK. Safe to import from the
 * client and server. All state changes flow through this table so that the
 * webhook handler cannot invent transitions ad-hoc.
 */
import type { SubscriptionStatus } from "./plans";
import { isValidTransition } from "./subscription-state";

/** Every Razorpay event we explicitly support. Anything else is IGNORED. */
export const SUPPORTED_RAZORPAY_EVENTS = [
  "subscription.authenticated",
  "subscription.activated",
  "subscription.charged",
  "subscription.pending",
  "subscription.halted",
  "subscription.paused",
  "subscription.resumed",
  "subscription.cancelled",
  "subscription.completed",
  "payment.captured",
  "payment.failed",
  "invoice.paid",
  "invoice.partially_paid",
  "invoice.expired",
] as const;

export type SupportedRazorpayEvent = (typeof SUPPORTED_RAZORPAY_EVENTS)[number];

export function isSupportedEvent(event: string): event is SupportedRazorpayEvent {
  return (SUPPORTED_RAZORPAY_EVENTS as readonly string[]).includes(event);
}

/** Target status the event should drive the subscription toward, if any. */
export function targetStatusForEvent(event: SupportedRazorpayEvent): SubscriptionStatus | null {
  switch (event) {
    case "subscription.authenticated":
      return "incomplete";
    case "subscription.activated":
    case "subscription.charged":
    case "subscription.resumed":
    case "payment.captured":
    case "invoice.paid":
      return "active";
    case "subscription.pending":
    case "payment.failed":
    case "invoice.partially_paid":
      return "past_due";
    case "subscription.halted":
    case "subscription.paused":
      return "suspended";
    case "subscription.cancelled":
      return "canceled";
    case "subscription.completed":
    case "invoice.expired":
      return "expired";
  }
}

export type EventDecision =
  | { action: "ignore"; reason: string }
  | { action: "no_transition"; from: SubscriptionStatus }
  | { action: "invalid_transition"; from: SubscriptionStatus; to: SubscriptionStatus }
  | { action: "transition"; from: SubscriptionStatus; to: SubscriptionStatus };

/**
 * Decide what a webhook should do given the event and the CURRENT internal
 * status. Never returns a forced transition; invalid transitions surface so
 * the caller can record failure and alert diagnostics.
 */
export function decideEventOutcome(
  event: string,
  currentStatus: SubscriptionStatus,
): EventDecision {
  if (!isSupportedEvent(event)) {
    return { action: "ignore", reason: `unsupported_event:${event}` };
  }
  const to = targetStatusForEvent(event);
  if (to === null) return { action: "ignore", reason: "no_target_state" };
  if (to === currentStatus) return { action: "no_transition", from: currentStatus };
  if (!isValidTransition(currentStatus, to)) {
    return { action: "invalid_transition", from: currentStatus, to };
  }
  return { action: "transition", from: currentStatus, to };
}