import { describe, it, expect } from "vitest";
import { buildLicenseView } from "./license";

const now = new Date("2026-07-14T00:00:00Z");

describe("buildLicenseView", () => {
  it("returns guest-like defaults when no row exists", () => {
    const v = buildLicenseView(null, "free", now);
    expect(v.status).toBe("active");
    expect(v.daysRemaining).toBeNull();
    expect(v.engineVersion).toBe("v1.0");
  });

  it("computes days remaining", () => {
    const v = buildLicenseView(
      {
        plan: "pro",
        license_key: "EB-XXX",
        status: "active",
        activated_at: "2026-01-01T00:00:00Z",
        expires_at: "2026-07-24T00:00:00Z",
        engine_version: "v1.0",
      },
      "pro",
      now,
    );
    expect(v.daysRemaining).toBe(10);
    expect(v.status).toBe("active");
  });

  it("flags expired licenses", () => {
    const v = buildLicenseView(
      {
        plan: "pro",
        license_key: "EB-XXX",
        status: "active",
        activated_at: "2025-01-01T00:00:00Z",
        expires_at: "2026-01-01T00:00:00Z",
        engine_version: "v1.0",
      },
      "pro",
      now,
    );
    expect(v.status).toBe("expired");
    expect(v.daysRemaining).toBe(0);
  });
});