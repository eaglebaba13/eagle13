import { describe, expect, it } from "vitest";
import {
  base32Decode,
  decodeJwtExp,
  generateTotp,
} from "../../../../scripts/refresh-upstox-token.mjs";

describe("Upstox Daily Token Refresh Script - Core Engine", () => {
  describe("base32Decode", () => {
    it("decodes RFC 4648 base32 strings correctly", () => {
      // "MY======" -> "f" (0x66)
      expect(base32Decode("MY======")).toEqual(Buffer.from("f"));
      // "MZXW6===" -> "foo"
      expect(base32Decode("MZXW6===")).toEqual(Buffer.from("foo"));
      // "MZXW6YQ=" -> "foob"
      expect(base32Decode("MZXW6YQ=")).toEqual(Buffer.from("foob"));
      // "MZXW6YTB" -> "fooba"
      expect(base32Decode("MZXW6YTB")).toEqual(Buffer.from("fooba"));
      // "MZXW6YTBOI======" -> "foobar"
      expect(base32Decode("MZXW6YTBOI======")).toEqual(Buffer.from("foobar"));
    });

    it("handles lowercase and whitespace in base32 secret", () => {
      expect(base32Decode("mzxw 6ytb oi  ")).toEqual(Buffer.from("foobar"));
    });

    it("throws on invalid characters", () => {
      expect(() => base32Decode("MZXW6YT8")).toThrow(/Invalid base32 character/); // '8' is not base32
    });
  });

  describe("generateTotp (RFC 6238 Standards Compliance)", () => {
    // Standard RFC 6238 test key: "12345678901234567890" -> Base32: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
    const rfcSecret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

    it("matches RFC 6238 Appendix B test vector at T=59s", () => {
      const code = generateTotp(rfcSecret, 30, 6, 59 * 1000);
      expect(code).toBe("287082");
    });

    it("matches RFC 6238 Appendix B test vector at T=1111111109s", () => {
      const code = generateTotp(rfcSecret, 30, 6, 1111111109 * 1000);
      expect(code).toBe("081804");
    });

    it("matches RFC 6238 Appendix B test vector at T=1234567890s", () => {
      const code = generateTotp(rfcSecret, 30, 6, 1234567890 * 1000);
      expect(code).toBe("005924");
    });

    it("always produces a 6-digit numeric string with zero-padding", () => {
      const code = generateTotp(rfcSecret, 30, 6, 1234567890 * 1000);
      expect(code).toHaveLength(6);
      expect(/^\d{6}$/.test(code)).toBe(true);
    });
  });

  describe("decodeJwtExp", () => {
    it("extracts expiration and subject from JWT", () => {
      const expSec = 1793829600;
      const header = Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url");
      const payload = Buffer.from(
        JSON.stringify({ sub: "3LCN2G", exp: expSec, isPlusPlan: true }),
      ).toString("base64url");
      const jwt = `${header}.${payload}.sig`;

      const result = decodeJwtExp(jwt);
      expect(result).not.toBeNull();
      expect(result?.expSec).toBe(expSec);
      expect(result?.expDate.toISOString()).toBe("2026-11-04T22:00:00.000Z");
      expect(result?.sub).toBe("3LCN2G");
      expect(result?.isPlusPlan).toBe(true);
    });

    it("returns null for non-JWT strings", () => {
      expect(decodeJwtExp("invalid.token")).toBeNull();
      expect(decodeJwtExp("")).toBeNull();
      expect(decodeJwtExp(null)).toBeNull();
    });
  });
});
