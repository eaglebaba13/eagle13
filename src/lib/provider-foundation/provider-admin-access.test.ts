import { describe, it, expect } from "vitest";
import { describeBlocker, type AdminAccessBlocker } from "./provider-admin-access.functions";

describe("provider-admin-access — safe blocker messages", () => {
  const blockers: readonly (AdminAccessBlocker | null)[] = [
    null,
    "AUTH_REQUIRED",
    "PROFILE_MISSING",
    "ADMIN_ROLE_MISSING",
    "HAS_ROLE_RPC_FAILED",
    "APPLICATION_FORBIDDEN",
  ];

  it("returns a distinct human-readable message for every blocker", () => {
    const seen = new Set<string>();
    for (const b of blockers) {
      const msg = describeBlocker(b);
      expect(typeof msg).toBe("string");
      expect(msg.length).toBeGreaterThan(0);
      seen.add(msg);
    }
    expect(seen.size).toBe(blockers.length);
  });

  it("never leaks provider-specific error strings", () => {
    for (const b of blockers) {
      const msg = describeBlocker(b);
      expect(msg).not.toMatch(/Bearer|access_token|api_key|api_secret|SUPABASE_/i);
    }
  });

  it("APPLICATION_AUTH vs UPSTOX_FORBIDDEN are separately named blockers", () => {
    expect(describeBlocker("ADMIN_ROLE_MISSING")).not.toEqual(
      describeBlocker("APPLICATION_FORBIDDEN"),
    );
  });
});