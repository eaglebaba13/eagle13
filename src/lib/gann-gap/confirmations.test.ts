import { describe, it, expect } from "vitest";
import {
  decisionConfirmation,
  pcrConfirmation,
  gtiConfirmation,
  breadthConfirmation,
  vixConfirmation,
  astroConfirmation,
} from "./confirmations";

describe("Gann Gap confirmations — canonical adapters", () => {
  it("Decision BULL supports UP", () => {
    expect(decisionConfirmation({ available: true, bias: "BULL" }, "SUPPORTS_UP").alignment).toBe("SUPPORTS_UP");
  });
  it("Decision BULL conflicts with DOWN", () => {
    expect(decisionConfirmation({ available: true, bias: "BULL" }, "SUPPORTS_DOWN").alignment).toBe("CONFLICT");
  });
  it("Decision unavailable → UNAVAILABLE, never fabricated", () => {
    const c = decisionConfirmation({ available: false, bias: null }, "SUPPORTS_UP");
    expect(c.alignment).toBe("UNAVAILABLE");
    expect(c.direction).toBe("UNKNOWN");
  });
  it("PCR CE/PE/NEUTRAL map correctly", () => {
    expect(pcrConfirmation({ available: true, direction: "CE" }, "SUPPORTS_UP").alignment).toBe("SUPPORTS_UP");
    expect(pcrConfirmation({ available: true, direction: "PE" }, "SUPPORTS_DOWN").alignment).toBe("SUPPORTS_DOWN");
    expect(pcrConfirmation({ available: true, direction: "NEUTRAL" }, "SUPPORTS_UP").alignment).toBe("NEUTRAL");
  });
  it("GTI state parsing", () => {
    expect(gtiConfirmation({ available: true, state: "STRONG_BULLISH" }, "SUPPORTS_UP").alignment).toBe("SUPPORTS_UP");
    expect(gtiConfirmation({ available: true, state: "STRONG_BEARISH" }, "SUPPORTS_DOWN").alignment).toBe("SUPPORTS_DOWN");
    expect(gtiConfirmation({ available: true, state: "NEUTRAL" }, "SUPPORTS_UP").alignment).toBe("NEUTRAL");
    expect(gtiConfirmation({ available: false, state: null }, "SUPPORTS_UP").alignment).toBe("UNAVAILABLE");
  });
  it("Breadth net > 0 supports UP", () => {
    expect(breadthConfirmation({ available: true, netBreadth: 20 }, "SUPPORTS_UP").alignment).toBe("SUPPORTS_UP");
    expect(breadthConfirmation({ available: true, netBreadth: -15 }, "SUPPORTS_DOWN").alignment).toBe("SUPPORTS_DOWN");
    expect(breadthConfirmation({ available: false, netBreadth: null }, "SUPPORTS_UP").alignment).toBe("UNAVAILABLE");
  });
  it("VIX heuristics", () => {
    expect(vixConfirmation({ available: true, value: 22, rising: true }, "SUPPORTS_DOWN").alignment).toBe("SUPPORTS_DOWN");
    expect(vixConfirmation({ available: true, value: 13, rising: false }, "SUPPORTS_UP").alignment).toBe("SUPPORTS_UP");
    expect(vixConfirmation({ available: false, value: null }, "SUPPORTS_UP").alignment).toBe("UNAVAILABLE");
  });
  it("Astro adapter mirrors bias", () => {
    expect(astroConfirmation({ available: true, bias: "BULL" }, "SUPPORTS_UP").alignment).toBe("SUPPORTS_UP");
    expect(astroConfirmation({ available: true, bias: "BEAR" }, "SUPPORTS_UP").alignment).toBe("CONFLICT");
    expect(astroConfirmation({ available: false, bias: null }, "SUPPORTS_UP").alignment).toBe("UNAVAILABLE");
  });
});