import { describe, it, expect } from "vitest";
import { extractExpiries } from "./upstox-provider.server";

describe("extractExpiries — Upstox /v2/option/contract response parsing", () => {
  it("parses the real Upstox shape: data is an array of contract rows", () => {
    const body = {
      status: "success",
      data: [
        { name: "NIFTY", expiry: "2026-07-31", instrument_key: "NSE_FO|xx", weekly: true },
        { name: "NIFTY", expiry: "2026-07-31", instrument_key: "NSE_FO|yy", weekly: true },
        { name: "NIFTY", expiry: "2026-07-24", instrument_key: "NSE_FO|zz", weekly: true },
        { name: "NIFTY", expiry: "2026-08-28", instrument_key: "NSE_FO|aa", weekly: false },
      ],
    };
    expect(extractExpiries(body.data)).toEqual([
      "2026-07-24",
      "2026-07-31",
      "2026-08-28",
    ]);
  });

  it("parses the legacy shape: { expiries: [...] }", () => {
    expect(extractExpiries({ expiries: ["2026-07-24", "2026-07-31"] })).toEqual([
      "2026-07-24",
      "2026-07-31",
    ]);
  });

  it("returns [] for empty array", () => {
    expect(extractExpiries([])).toEqual([]);
  });

  it("returns [] for null/undefined/malformed input", () => {
    expect(extractExpiries(null)).toEqual([]);
    expect(extractExpiries(undefined)).toEqual([]);
    expect(extractExpiries({ foo: 1 })).toEqual([]);
  });

  it("strips time-of-day from ISO datetime expiries", () => {
    expect(extractExpiries([{ expiry: "2026-07-31T14:30:00.000Z" }])).toEqual([
      "2026-07-31",
    ]);
  });

  it("ignores malformed expiry strings", () => {
    expect(
      extractExpiries([
        { expiry: "not-a-date" },
        { expiry: "" },
        { expiry: null },
        { expiry: "2026-07-31" },
      ]),
    ).toEqual(["2026-07-31"]);
  });
});