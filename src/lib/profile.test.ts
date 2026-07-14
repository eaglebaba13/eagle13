import { describe, it, expect } from "vitest";
import { initials, serializeProfile } from "./profile";

describe("profile", () => {
  it("serializes with defaults", () => {
    const p = serializeProfile(
      {
        id: "u1",
        email: "raj@example.com",
        display_name: null,
        avatar_url: null,
        timezone: null,
        country: null,
        currency: null,
        preferred_broker: null,
        preferred_instrument: null,
        language: null,
        theme: null,
      },
      "pro",
    );
    expect(p.displayName).toBe("raj");
    expect(p.timezone).toBe("Asia/Kolkata");
    expect(p.currency).toBe("INR");
    expect(p.role).toBe("pro");
  });

  it("initials picks first two words", () => {
    expect(initials("Raj Kumar")).toBe("RK");
    expect(initials("solo")).toBe("S");
    expect(initials("")).toBe("U");
  });
});