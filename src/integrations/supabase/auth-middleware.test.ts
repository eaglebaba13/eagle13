import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createMiddleware: () => ({ server: (handler: unknown) => handler }),
}));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn() }));

import { createClient } from "@supabase/supabase-js";
import { getRequest } from "@tanstack/react-start/server";
import { assertAuth, requireSupabaseAuth } from "./auth-middleware";

const middleware = requireSupabaseAuth as unknown as (args: {
  next: (options: { context: unknown }) => Promise<unknown>;
}) => Promise<unknown>;

describe("Supabase auth middleware context contract", () => {
  const claims = { sub: "test-user", role: "authenticated" };
  const getClaims = vi.fn();
  const client = { auth: { getClaims } };
  const next = vi.fn(async (options: { context: unknown }) => options.context);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SUPABASE_URL", "https://test-only.example.invalid");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test_only");
    vi.mocked(getRequest).mockReturnValue(
      new Request("https://test-only.example.invalid", {
        headers: { authorization: "Bearer test.only.token" },
      }),
    );
    vi.mocked(createClient).mockReturnValue(client as unknown as ReturnType<typeof createClient>);
    getClaims.mockResolvedValue({ data: { claims } });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("preserves authenticated client, user and claims", async () => {
    expect(await middleware({ next })).toEqual({ supabase: client, userId: "test-user", claims });
    expect(getClaims).toHaveBeenCalledWith("test.only.token");
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("passes through missing auth without constructing a client", async () => {
    vi.mocked(getRequest).mockReturnValue(new Request("https://test-only.example.invalid"));
    expect(await middleware({ next })).toEqual({ supabase: null, userId: null, claims: null });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("passes through missing configuration without constructing a client", async () => {
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "");
    expect(await middleware({ next })).toEqual({ supabase: null, userId: null, claims: null });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("passes through malformed token without verifying claims", async () => {
    vi.mocked(getRequest).mockReturnValue(
      new Request("https://test-only.example.invalid", {
        headers: { authorization: "Bearer malformed-test-token" },
      }),
    );
    expect(await middleware({ next })).toEqual({ supabase: null, userId: null, claims: null });
    expect(getClaims).not.toHaveBeenCalled();
  });

  it("preserves a client with null identity when verification fails", async () => {
    getClaims.mockResolvedValue({ data: null });
    expect(await middleware({ next })).toEqual({ supabase: client, userId: null, claims: null });
  });

  it("rejects null identity at protected handler assertion", () => {
    expect(() => assertAuth({ userId: null })).toThrow("Unauthorized");
    expect(() => assertAuth({ userId: "test-user" })).not.toThrow();
  });
});
