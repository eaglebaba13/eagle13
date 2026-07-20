import { describe, it, expect } from "vitest";
import {
  ProviderError,
  isProviderError,
  categorizeHttpStatus,
  categorizeFetchFailure,
  makeProviderError,
} from "./provider-errors";

describe("provider-errors", () => {
  it("categorises HTTP statuses", () => {
    expect(categorizeHttpStatus(429)).toBe("RateLimited");
    expect(categorizeHttpStatus(400)).toBe("HTTPError");
    expect(categorizeHttpStatus(503)).toBe("HTTPError");
    expect(categorizeHttpStatus(200)).toBe("ProviderUnavailable");
  });

  it("categorises fetch failures", () => {
    expect(categorizeFetchFailure(new Error("The user aborted a request"))).toBe(
      "NetworkTimeout",
    );
    expect(categorizeFetchFailure(new Error("timed out"))).toBe("NetworkTimeout");
    expect(categorizeFetchFailure(new Error("ENOTFOUND"))).toBe("ProviderUnavailable");
  });

  it("makes a typed ProviderError with full diagnostics", () => {
    const err = makeProviderError({
      message: "Data source error 400 for query1.finance.yahoo.com",
      category: "HTTPError",
      url: "https://query1.finance.yahoo.com/v7/foo",
      httpStatus: 400,
      latencyMs: 42,
      retryCount: 2,
      stage: "response",
    });
    expect(err).toBeInstanceOf(ProviderError);
    expect(isProviderError(err)).toBe(true);
    expect(err.category).toBe("HTTPError");
    expect(err.diagnostics.provider).toBe("query1.finance.yahoo.com");
    expect(err.diagnostics.endpoint).toContain("/v7/foo");
    expect(err.diagnostics.httpStatus).toBe(400);
    expect(err.diagnostics.latencyMs).toBe(42);
    expect(err.diagnostics.retryCount).toBe(2);
    expect(err.diagnostics.stage).toBe("response");
    expect(typeof err.diagnostics.timestamp).toBe("string");
  });

  it("isProviderError rejects plain Errors and non-errors", () => {
    expect(isProviderError(new Error("nope"))).toBe(false);
    expect(isProviderError("nope")).toBe(false);
    expect(isProviderError(null)).toBe(false);
  });
});