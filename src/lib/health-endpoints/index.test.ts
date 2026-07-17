import { describe, it, expect } from "vitest";
import { buildHealthPayload, httpStatusFor, rollupStatus } from "./index";

const build = {
  version: "1.0.0",
  gitCommit: "abc123",
  deployedAt: "2026-07-17T00:00:00Z",
  environment: "production" as const,
};

describe("health-endpoints", () => {
  it("rollupStatus is healthy when all healthy", () => {
    expect(
      rollupStatus([
        { name: "application", status: "healthy" },
        { name: "database", status: "healthy" },
      ]),
    ).toBe("healthy");
  });

  it("rollupStatus escalates to worst", () => {
    expect(
      rollupStatus([
        { name: "application", status: "healthy" },
        { name: "provider", status: "degraded" },
        { name: "database", status: "unhealthy" },
      ]),
    ).toBe("unhealthy");
  });

  it("empty subsystems -> unknown", () => {
    expect(rollupStatus([])).toBe("unknown");
  });

  it("buildHealthPayload embeds build + checkedAt", () => {
    const p = buildHealthPayload(
      [{ name: "cache", status: "healthy" }],
      build,
      new Date("2026-01-01T00:00:00Z"),
    );
    expect(p.status).toBe("healthy");
    expect(p.build.gitCommit).toBe("abc123");
    expect(p.checkedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("httpStatusFor maps unhealthy -> 503, else 200", () => {
    expect(httpStatusFor("unhealthy")).toBe(503);
    expect(httpStatusFor("degraded")).toBe(200);
    expect(httpStatusFor("healthy")).toBe(200);
  });
});