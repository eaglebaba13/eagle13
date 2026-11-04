import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  decodeJwtExpiry,
  evaluateUpstoxTokenPolicy,
  readTokenFromFile,
  resetTokenFileCache,
  resolveUpstoxAccessToken,
  resolveUpstoxMarketDataToken,
  resolveUpstoxTokenFilePath,
} from "./upstox-token-policy.server";

// Helper to create a fake JWT with a specific expiration timestamp (seconds)
function makeJwt(expSec: number, sub = "TEST_USER"): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ sub, exp: expSec })).toString("base64url");
  return `${header}.${payload}.fake_signature`;
}

describe("Upstox Dynamic Token File & Hot-Reload Policy", () => {
  let tmpDir: string;
  let tokenFile: string;
  const originalEnvToken = process.env.UPSTOX_ACCESS_TOKEN;
  const originalEnvFile = process.env.UPSTOX_TOKEN_FILE;

  beforeEach(() => {
    resetTokenFileCache();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "upstox-token-test-"));
    tokenFile = path.join(tmpDir, "upstox_token.json");
    delete process.env.UPSTOX_ACCESS_TOKEN;
    delete process.env.UPSTOX_TOKEN_FILE;
  });

  afterEach(() => {
    resetTokenFileCache();
    if (originalEnvToken !== undefined) {
      process.env.UPSTOX_ACCESS_TOKEN = originalEnvToken;
    } else {
      delete process.env.UPSTOX_ACCESS_TOKEN;
    }
    if (originalEnvFile !== undefined) {
      process.env.UPSTOX_TOKEN_FILE = originalEnvFile;
    } else {
      delete process.env.UPSTOX_TOKEN_FILE;
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  describe("resolveUpstoxTokenFilePath", () => {
    it("respects env.UPSTOX_TOKEN_FILE if provided", () => {
      const resolved = resolveUpstoxTokenFilePath({ UPSTOX_TOKEN_FILE: "/custom/path.json" });
      expect(resolved).toBe("/custom/path.json");
    });

    it("respects process.env.UPSTOX_TOKEN_FILE if set", () => {
      process.env.UPSTOX_TOKEN_FILE = "/env/token.json";
      expect(resolveUpstoxTokenFilePath()).toBe("/env/token.json");
    });

    it("treats 'none' or 'off' as disabled", () => {
      expect(resolveUpstoxTokenFilePath({ UPSTOX_TOKEN_FILE: "none" })).toBeUndefined();
      expect(resolveUpstoxTokenFilePath({ UPSTOX_TOKEN_FILE: "off" })).toBeUndefined();
    });
  });

  describe("decodeJwtExpiry", () => {
    it("decodes valid numeric exp from JWT payload", () => {
      const expSec = Math.floor(Date.now() / 1000) + 3600;
      const jwt = makeJwt(expSec);
      expect(decodeJwtExpiry(jwt)).toBe(expSec * 1000);
    });

    it("returns undefined for non-JWT strings or missing exp", () => {
      expect(decodeJwtExpiry("not-a-jwt")).toBeUndefined();
      expect(decodeJwtExpiry(undefined)).toBeUndefined();
      expect(decodeJwtExpiry("")).toBeUndefined();
      expect(decodeJwtExpiry("xxxx")).toBeUndefined();
    });
  });

  describe("readTokenFromFile", () => {
    it("returns undefined when file does not exist", () => {
      expect(readTokenFromFile(path.join(tmpDir, "non_existent.json"))).toBeUndefined();
    });

    it("reads valid JSON payload with access_token", () => {
      const futureExp = Math.floor(Date.now() / 1000) + 7200;
      const liveToken = makeJwt(futureExp, "HOT_RELOAD_USER");
      fs.writeFileSync(
        tokenFile,
        JSON.stringify({
          access_token: liveToken,
          updated_at: new Date().toISOString(),
          expires_at: new Date(futureExp * 1000).toISOString(),
        }),
      );

      const loaded = readTokenFromFile(tokenFile);
      expect(loaded).toBe(liveToken);
      expect(process.env.UPSTOX_ACCESS_TOKEN).toBe(liveToken);
    });

    it("reads valid JSON payload with token field", () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const liveToken = makeJwt(futureExp);
      fs.writeFileSync(tokenFile, JSON.stringify({ token: liveToken }));

      expect(readTokenFromFile(tokenFile)).toBe(liveToken);
    });

    it("reads raw string token file", () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const liveToken = makeJwt(futureExp);
      fs.writeFileSync(tokenFile, `  ${liveToken}  \n`);

      expect(readTokenFromFile(tokenFile)).toBe(liveToken);
    });

    it("rejects expired tokens based on explicit expires_at field", () => {
      const pastDate = new Date(Date.now() - 60_000).toISOString();
      fs.writeFileSync(
        tokenFile,
        JSON.stringify({
          access_token: "any-token-value",
          expires_at: pastDate,
        }),
      );

      expect(readTokenFromFile(tokenFile)).toBeUndefined();
    });

    it("rejects expired tokens based on JWT exp claim", () => {
      const pastSec = Math.floor(Date.now() / 1000) - 300; // 5 minutes ago
      const expiredJwt = makeJwt(pastSec);
      fs.writeFileSync(tokenFile, JSON.stringify({ access_token: expiredJwt }));

      expect(readTokenFromFile(tokenFile)).toBeUndefined();
    });

    it("rejects placeholder tokens inside file", () => {
      fs.writeFileSync(tokenFile, JSON.stringify({ access_token: "xxxx" }));
      expect(readTokenFromFile(tokenFile)).toBeUndefined();
    });

    it("reloads hot changes when file mtime updates", () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const token1 = makeJwt(futureExp, "TOKEN_ONE");
      fs.writeFileSync(tokenFile, JSON.stringify({ access_token: token1 }));
      expect(readTokenFromFile(tokenFile)).toBe(token1);

      // Update file with new token
      const token2 = makeJwt(futureExp + 100, "TOKEN_TWO");
      // Advance mtime slightly so stat registers change
      fs.writeFileSync(tokenFile, JSON.stringify({ access_token: token2 }));
      const newMtime = new Date(Date.now() + 2000);
      fs.utimesSync(tokenFile, newMtime, newMtime);

      expect(readTokenFromFile(tokenFile)).toBe(token2);
      expect(process.env.UPSTOX_ACCESS_TOKEN).toBe(token2);
    });
  });

  describe("Hot-reload precedence in resolveUpstoxAccessToken & resolveUpstoxMarketDataToken", () => {
    it("file token takes precedence over stale env variable", () => {
      const staleToken = "stale-env-token";
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const freshFileToken = makeJwt(futureExp, "FRESH_OPERATOR");

      fs.writeFileSync(tokenFile, JSON.stringify({ access_token: freshFileToken }));

      const resolved = resolveUpstoxAccessToken({
        UPSTOX_ACCESS_TOKEN: staleToken,
        UPSTOX_TOKEN_FILE: tokenFile,
      });

      expect(resolved).toBe(freshFileToken);
    });

    it("falls back to env token when file does not exist", () => {
      const envToken = "valid-env-token";
      const resolved = resolveUpstoxAccessToken({
        UPSTOX_ACCESS_TOKEN: envToken,
        UPSTOX_TOKEN_FILE: path.join(tmpDir, "does-not-exist.json"),
      });

      expect(resolved).toBe(envToken);
    });

    it("evaluates token policy with hot-reloaded token", () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const freshFileToken = makeJwt(futureExp, "FRESH_OPERATOR");

      fs.writeFileSync(tokenFile, JSON.stringify({ access_token: freshFileToken }));

      const status = evaluateUpstoxTokenPolicy({
        UPSTOX_MARKET_DATA_MODE: "live",
        UPSTOX_API_KEY: "my-key",
        UPSTOX_API_SECRET: "my-secret",
        UPSTOX_ACCESS_TOKEN: "stale-placeholder",
        UPSTOX_TOKEN_FILE: tokenFile,
      });

      expect(status.tokenPresent).toBe(true);
      expect(status.tokenUsable).toBe(true);
      expect(status.tokenExpiryStatus).toBe("OK");
      expect(status.tokenFormat).toBe("JWT");
      expect(status.tokenSource).toBe("LIVE");
    });
  });
});
