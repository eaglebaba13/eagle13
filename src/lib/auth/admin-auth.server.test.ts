import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRequest: vi.fn(),
  getUser: vi.fn(),
  roles: vi.fn(),
}));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: mocks.getRequest }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    auth: { getUser: mocks.getUser },
    from: () => ({ select: () => ({ eq: mocks.roles }) }),
  },
}));

import { requireStrictSuperadmin } from "./admin-auth.server";

describe("strict superadmin access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SUPERADMIN_USER_IDS;
    mocks.getRequest.mockReturnValue(undefined);
    mocks.getUser.mockResolvedValue({ data: { user: { id: "u1", app_metadata: {} } }, error: null });
    mocks.roles.mockResolvedValue({ data: [{ role: "admin" }], error: null });
  });
  it("rejects missing and guest credentials", async () => {
    await expect(requireStrictSuperadmin()).rejects.toThrow("UNAUTHORIZED");
    await expect(requireStrictSuperadmin("guest-token")).rejects.toThrow("UNAUTHORIZED");
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it("rejects an ordinary admin", async () => {
    await expect(requireStrictSuperadmin("valid-token")).rejects.toThrow("FORBIDDEN");
  });
  it("accepts only a verified superadmin", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "u1", app_metadata: { role: "superadmin" } } }, error: null });
    await expect(requireStrictSuperadmin("valid-token")).resolves.toEqual({ userId: "u1", role: "SUPERADMIN" });
  });
});
