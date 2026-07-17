import { describe, it, expect } from "vitest";
import { redactString, redactValue, safeDiagnosticsJson } from "./diagnostics-redact";

describe("gann-gap diagnostics redaction", () => {
  it("redacts URLs, bearer tokens, JWTs", () => {
    expect(redactString("call https://example.com/x?y=1")).toContain("[REDACTED_URL]");
    expect(redactString("Authorization: Bearer abc.def-123")).toContain("[REDACTED_BEARER]");
    expect(redactString("eyJhaaaaaa.eyJbbbbbb.ccccccc")).toContain("[REDACTED_JWT]");
  });
  it("redacts sensitive keys recursively", () => {
    const out = redactValue({
      Authorization: "Bearer x",
      apiKey: "y",
      nested: { serviceRole: "z", ok: "keep" },
    }) as Record<string, unknown>;
    expect(out.Authorization).toBe("[REDACTED]");
    expect(out.apiKey).toBe("[REDACTED]");
    expect((out.nested as Record<string, unknown>).serviceRole).toBe("[REDACTED]");
    expect((out.nested as Record<string, unknown>).ok).toBe("keep");
  });
  it("safeDiagnosticsJson contains no raw urls/bearers", () => {
    const s = safeDiagnosticsJson({ log: "GET https://api.example.com/v1 Bearer abcdef" });
    expect(s).not.toContain("https://api.example.com");
    expect(s).not.toContain("Bearer abcdef");
  });
});