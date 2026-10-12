import { describe, expect, it, vi } from "vitest";

// Reduce createServerFn to a pass-through so the raw handler can be exercised
// directly with a synthetic auth context. Mirrors auth-middleware.test.ts.
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware: () => ({ handler: (fn: unknown) => fn }),
    handler: (fn: unknown) => fn,
  }),
  createMiddleware: () => ({ server: (handler: unknown) => handler }),
}));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn() }));

import { getServerDiagnostics, type ServerDiagnostics } from "./diagnostics.functions";

// The mocked createServerFn returns the raw handler, so we invoke it directly
// with a fake { context } shaped like the discriminated-union AuthContext.
const fn = getServerDiagnostics as unknown as (args: {
  context: unknown;
}) => Promise<ServerDiagnostics>;

const adminClaims = { sub: "admin-1", role: "authenticated" };
const userClaims = { sub: "user-1", role: "authenticated" };

function anonymousContext() {
  // Exactly what requireSupabaseAuth forwards on missing/invalid/verified-failed tokens.
  return { supabase: null, userId: null, claims: null };
}

function authenticatedContext(userId: string, rpc: unknown, claims: unknown) {
  return { supabase: { rpc }, userId, claims };
}

describe("getServerDiagnostics auth hardening (admin-only)", () => {
  it("rejects anonymous callers via assertAuth (no verified identity)", async () => {
    await expect(fn({ context: anonymousContext() })).rejects.toThrow("Unauthorized");
  });

  it("rejects an ordinary authenticated user (non-admin) without returning data", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
    await expect(fn({ context: authenticatedContext("user-1", rpc, userClaims) })).rejects.toThrow(
      "forbidden",
    );
    expect(rpc).toHaveBeenCalledWith("has_role", { _user_id: "user-1", _role: "admin" });
  });

  it("surfaces a has_role RPC error without returning diagnostics", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "role_check_failed" } });
    await expect(fn({ context: authenticatedContext("user-1", rpc, userClaims) })).rejects.toThrow(
      "role_check_failed",
    );
  });

  it("returns the full diagnostics payload for a verified admin (authorized behavior preserved)", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const res = await fn({ context: authenticatedContext("admin-1", rpc, adminClaims) });
    expect(rpc).toHaveBeenCalledWith("has_role", { _user_id: "admin-1", _role: "admin" });
    expect(typeof res.ts).toBe("number");
    expect(typeof res.isDev).toBe("boolean");
    expect(res).toHaveProperty("cache");
    expect(res).toHaveProperty("formulaVersion");
    expect(res).toHaveProperty("api");
    expect(res).toHaveProperty("errors");
    expect(res.formulaVersion).toHaveProperty("default");
  });

  it("never leaks diagnostics data to unauthorized callers (anonymous or non-admin)", async () => {
    const anonRpc = vi.fn();
    await expect(fn({ context: anonymousContext() })).rejects.toThrow();
    expect(anonRpc).not.toHaveBeenCalled();

    const userRpc = vi.fn().mockResolvedValue({ data: false, error: null });
    await expect(
      fn({ context: authenticatedContext("user-1", userRpc, userClaims) }),
    ).rejects.toThrow("forbidden");
  });
});
