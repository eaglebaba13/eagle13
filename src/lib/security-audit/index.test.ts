import { describe, it, expect } from "vitest";
import {
  REQUIRED_SECURITY_HEADERS,
  buildSecurityAudit,
  evaluateCsp,
  evaluateSecurityHeaders,
} from "./index";

describe("security-audit", () => {
  it("headers PASS when all required present", () => {
    const h: Record<string, string> = {};
    for (const k of REQUIRED_SECURITY_HEADERS) h[k] = "x";
    expect(evaluateSecurityHeaders(h).present).toBe(true);
  });

  it("headers FAIL when any missing", () => {
    const c = evaluateSecurityHeaders({});
    expect(c.present).toBe(false);
    expect(c.detail).toMatch(/missing/);
  });

  it("CSP passes with default-src and no unsafe-inline", () => {
    expect(evaluateCsp("default-src 'self'").present).toBe(true);
  });

  it("CSP fails when unsafe-inline present", () => {
    expect(evaluateCsp("default-src 'self' 'unsafe-inline'").present).toBe(false);
  });

  it("CSP fails when missing entirely", () => {
    expect(evaluateCsp(undefined).present).toBe(false);
  });

  it("buildSecurityAudit -> FAIL when critical missing", () => {
    const r = buildSecurityAudit([
      { id: "security-headers", present: false },
      { id: "content-security-policy", present: true },
      { id: "rate-limit", present: true },
      { id: "session-validation", present: true },
      { id: "webhook-validation", present: true },
      { id: "secrets-audit", present: true },
    ]);
    expect(r.severity).toBe("FAIL");
    expect(r.missingCritical).toContain("security-headers");
  });

  it("buildSecurityAudit -> PASS when all present", () => {
    const r = buildSecurityAudit([
      { id: "security-headers", present: true },
      { id: "content-security-policy", present: true },
      { id: "rate-limit", present: true },
      { id: "session-validation", present: true },
      { id: "webhook-validation", present: true },
      { id: "secrets-audit", present: true },
    ]);
    expect(r.severity).toBe("PASS");
  });
});