// Canonical market session hook for React components.
// Wraps nseSession() from terminal-clock.ts.
// Single source of truth for NSE market session state.
// All components displaying market session status should use this.

import { useState, useEffect } from "react";
import { nseSession, type SessionState } from "@/lib/terminal-clock";

const POLL_MS = 30_000; // Update every 30 seconds

/**
 * React hook that provides the canonical NSE market session state.
 * Updates every 30 seconds. Uses nseSession() as the single source of truth.
 *
 * Returns the full SessionState object:
 * - market: "NSE / BSE"
 * - status: "CLOSED" | "WEEKEND" | "HOLIDAY" | "PRE-OPEN" | "ORDER MATCHING" | "LIVE MARKET" | "POST MARKET"
 * - isOpen: boolean
 * - color: "green" | "red" | "yellow" | "blue" | "muted"
 * - countdownMs: time to next transition
 * - progressPct: progress through current window
 */
export function useMarketSession(): SessionState {
  const [session, setSession] = useState<SessionState>(() => nseSession());

  useEffect(() => {
    const update = () => setSession(nseSession());
    update(); // immediate
    const interval = setInterval(update, POLL_MS);
    return () => clearInterval(interval);
  }, []);

  return session;
}

/**
 * Derive a simple market session status string from a SessionState.
 * Returns "OPEN" | "CLOSED" | "WEEKEND" | "HOLIDAY" | "PRE_OPEN" | "POST_MARKET"
 */
export function deriveMarketSessionStatus(session: SessionState): string {
  switch (session.status) {
    case "LIVE MARKET":
      return "OPEN";
    case "PRE-OPEN":
      return "PRE_OPEN";
    case "ORDER MATCHING":
      return "OPEN"; // Exchange is processing orders
    case "POST MARKET":
      return "POST_MARKET";
    case "WEEKEND":
      return "WEEKEND";
    case "HOLIDAY":
      return "HOLIDAY";
    case "CLOSED":
    default:
      return "CLOSED";
  }
}
