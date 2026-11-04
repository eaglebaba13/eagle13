#!/usr/bin/env node
/**
 * EagleBABA Upstox Automated Daily Access Token Refresh Pipeline
 * 
 * Automates headless acquisition of daily Upstox Access Tokens via Upstox v2 TOTP API,
 * decodes JWT expiration metadata, and atomically writes to the shared hot-reload
 * token file (`/app/.tokens/upstox_token.json` or path in `UPSTOX_TOKEN_FILE`).
 *
 * Can run:
 *   1. Inside the active container (via cron/systemd or manual execution).
 *   2. On the VPS host (auto-detects and synchronizes running container and Coolify .env).
 *
 * Security:
 *   - Pure Node.js zero-dependency ESM implementation (native crypto RFC 6238 TOTP).
 *   - Strictly redacts all secret tokens, API keys, and PINs in log outputs.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

// ──────────────── TOTP RFC 6238 Engine ────────────────

/**
 * Decodes a base32 encoded secret string to a Buffer (RFC 4648).
 */
export function base32Decode(str) {
  if (!str || typeof str !== "string") {
    throw new Error("Invalid base32 secret string");
  }
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleaned = str.toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (let i = 0; i < cleaned.length; i++) {
    const idx = alphabet.indexOf(cleaned[i]);
    if (idx === -1) {
      throw new Error(`Invalid base32 character in TOTP secret: ${cleaned[i]}`);
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/**
 * Computes a standard 6-digit RFC 6238 Time-based One-Time Password.
 * Default time step: 30 seconds.
 */
export function generateTotp(secret, timeStepSec = 30, digits = 6, timeMs = Date.now()) {
  const key = base32Decode(secret);
  const counter = Math.floor(timeMs / 1000 / timeStepSec);
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  ) % Math.pow(10, digits);
  return code.toString().padStart(digits, "0");
}

/**
 * Decodes JWT exp claim without verification (expiration check only).
 */
export function decodeJwtExp(token) {
  if (!token || typeof token !== "string") return null;
  try {
    const parts = token.trim().split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const jsonStr = Buffer.from(base64, "base64").toString("utf-8");
    const payload = JSON.parse(jsonStr);
    if (typeof payload?.exp === "number") {
      return {
        expSec: payload.exp,
        expDate: new Date(payload.exp * 1000),
        sub: payload.sub || null,
        isPlusPlan: Boolean(payload.isPlusPlan),
      };
    }
    return null;
  } catch {
    return null;
  }
}

// ──────────────── CLI Parsing ────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    apiKey: process.env.UPSTOX_API_KEY,
    apiSecret: process.env.UPSTOX_API_SECRET,
    pin: process.env.UPSTOX_PIN,
    totpSecret: process.env.UPSTOX_TOTP_SECRET,
    clientId: process.env.UPSTOX_CLIENT_ID || process.env.UPSTOX_MOBILE,
    redirectUri: process.env.UPSTOX_REDIRECT_URI || "https://127.0.0.1",
    tokenFile:
      process.env.UPSTOX_TOKEN_FILE ||
      (process.platform === "linux" ? "/app/.tokens/upstox_token.json" : "./.tokens/upstox_token.json"),
    setToken: null,
    authCode: null,
    force: false,
    dryRun: false,
    check: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--api-key" && args[i + 1]) options.apiKey = args[++i];
    else if (arg === "--api-secret" && args[i + 1]) options.apiSecret = args[++i];
    else if (arg === "--pin" && args[i + 1]) options.pin = args[++i];
    else if (arg === "--totp-secret" && args[i + 1]) options.totpSecret = args[++i];
    else if (arg === "--client-id" && args[i + 1]) options.clientId = args[++i];
    else if (arg === "--mobile" && args[i + 1]) options.clientId = args[++i];
    else if (arg === "--redirect-uri" && args[i + 1]) options.redirectUri = args[++i];
    else if (arg === "--token-file" && args[i + 1]) options.tokenFile = args[++i];
    else if (arg === "--set-token" && args[i + 1]) options.setToken = args[++i];
    else if (arg === "--auth-code" && args[i + 1]) options.authCode = args[++i];
    else if (arg === "--force") options.force = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--check") options.check = true;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`
EagleBABA Upstox Daily Access Token Refresh Pipeline

Usage:
  node scripts/refresh-upstox-token.mjs [options]

Options:
  --pin <pin>              6-digit Upstox PIN (or UPSTOX_PIN env)
  --totp-secret <secret>   Base32 TOTP secret key (or UPSTOX_TOTP_SECRET env)
  --api-key <key>          Upstox App API Key (or UPSTOX_API_KEY env)
  --api-secret <secret>    Upstox App API Secret (or UPSTOX_API_SECRET env)
  --token-file <path>      Output token JSON file path (default: /app/.tokens/upstox_token.json)
  --set-token <token>      Directly store pre-generated token without calling Upstox API
  --auth-code <code>       Exchange OAuth authorization code for token
  --redirect-uri <uri>     OAuth redirect URI (default: https://127.0.0.1)
  --force                  Force refresh even if active token is unexpired
  --dry-run                Validate credentials and TOTP generation without saving
  --check                  Check active token validity and exit (code 0: valid, 1: expired/missing)
  --help, -h               Show this help message
`);
}

// ──────────────── Atomic File Writer ────────────────

function atomicWriteJson(targetPath, data) {
  const resolved = path.resolve(targetPath);
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const tmpPath = `${resolved}.tmp.${Date.now()}.${process.pid}`;
  const content = JSON.stringify(data, null, 2) + "\n";

  fs.writeFileSync(tmpPath, content, { encoding: "utf-8", mode: 0o600 });
  fs.renameSync(tmpPath, resolved);
}

// ──────────────── Upstox API Client ────────────────

/**
 * Directly logs in via Upstox v2 TOTP API.
 * Endpoint: POST https://api.upstox.com/v2/totp-login/authorization/token
 */
async function loginViaTotp({ apiKey, pin, totpCode }) {
  const url = "https://api.upstox.com/v2/totp-login/authorization/token";
  const body = JSON.stringify({
    totp: String(totpCode),
    pin: String(pin),
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      accept: "application/json",
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body,
  });

  const responseText = await response.text();
  let json;
  try {
    json = JSON.parse(responseText);
  } catch {
    throw new Error(`Upstox TOTP API returned non-JSON response (HTTP ${response.status})`);
  }

  if (!response.ok || json.status === "error") {
    const errorMsg = json?.errors?.[0]?.message || json?.message || `HTTP ${response.status}`;
    const errorCode = json?.errors?.[0]?.errorCode || json?.errors?.[0]?.error_code || "AUTH_FAILED";
    throw new Error(`Upstox TOTP login rejected [${errorCode}]: ${errorMsg}`);
  }

  const accessToken = json?.data?.access_token || json?.access_token;
  if (!accessToken || typeof accessToken !== "string") {
    throw new Error("Upstox response did not contain access_token");
  }

  return {
    accessToken,
    userId: json?.data?.user_id || json?.user_id || null,
    userName: json?.data?.user_name || json?.user_name || null,
  };
}

/**
 * Exchanges authorization code for access token.
 * Endpoint: POST https://api.upstox.com/v2/login/authorization/token
 */
async function exchangeAuthCode({ apiKey, apiSecret, redirectUri, authCode }) {
  const url = "https://api.upstox.com/v2/login/authorization/token";
  const params = new URLSearchParams({
    code: authCode,
    client_id: apiKey,
    client_secret: apiSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const responseText = await response.text();
  let json;
  try {
    json = JSON.parse(responseText);
  } catch {
    throw new Error(`Upstox OAuth code exchange returned non-JSON response (HTTP ${response.status})`);
  }

  if (!response.ok || json.status === "error") {
    const errorMsg = json?.errors?.[0]?.message || json?.message || `HTTP ${response.status}`;
    throw new Error(`Upstox OAuth token exchange failed: ${errorMsg}`);
  }

  const accessToken = json?.access_token || json?.data?.access_token;
  if (!accessToken || typeof accessToken !== "string") {
    throw new Error("Upstox response did not contain access_token");
  }

  return {
    accessToken,
    userId: json?.user_id || json?.data?.user_id || null,
    userName: json?.user_name || json?.data?.user_name || null,
  };
}

// ──────────────── Host Docker & Coolify Synchronization ────────────────

function syncHostDockerAndCoolify(newAccessToken) {
  // If running on host VPS outside docker, synchronize running containers and Coolify .env
  try {
    const isDockerContainer = fs.existsSync("/.dockerenv");
    if (isDockerContainer) return; // Inside container, no host sync needed

    // Check if docker CLI is available
    const hasDocker = (() => {
      try {
        execSync("which docker", { stdio: "ignore" });
        return true;
      } catch {
        return false;
      }
    })();

    if (!hasDocker) return;

    // Find active container for eaglebaba
    const containerId = execSync(
      'docker ps -q --filter "label=coolify.resourceName=eaglebaba" || docker ps -q --filter "name=zrrxmyubwxrhfowlnmfztutk"',
      { encoding: "utf-8" },
    ).trim().split("\n")[0];

    if (containerId) {
      console.log(`[HostSync] Synchronizing token with active container: ${containerId}`);
      // Push token file directly into container's hot-reload path
      execSync(`docker exec ${containerId} mkdir -p /app/.tokens`, { stdio: "ignore" });
      execSync(
        `docker exec ${containerId} node -e '
          const fs = require("node:fs");
          const payload = {
            access_token: process.argv[1],
            updated_at: new Date().toISOString(),
            source: "host_sync"
          };
          fs.writeFileSync("/app/.tokens/upstox_token.json", JSON.stringify(payload, null, 2) + "\\n");
        ' "${newAccessToken}"`,
        { stdio: "inherit" },
      );
      console.log("[HostSync] Container /app/.tokens/upstox_token.json updated successfully.");
    }

    // Also update Coolify .env if present
    const coolifyEnvPath = "/data/coolify/applications/zrrxmyubwxrhfowlnmfztutk/.env";
    if (fs.existsSync(coolifyEnvPath)) {
      let content = fs.readFileSync(coolifyEnvPath, "utf-8");
      if (content.includes("UPSTOX_ACCESS_TOKEN=")) {
        content = content.replace(/UPSTOX_ACCESS_TOKEN=.*/g, `UPSTOX_ACCESS_TOKEN=${newAccessToken}`);
      } else {
        content += `\nUPSTOX_ACCESS_TOKEN=${newAccessToken}\n`;
      }
      fs.writeFileSync(coolifyEnvPath, content, "utf-8");
      console.log(`[HostSync] Updated UPSTOX_ACCESS_TOKEN in Coolify .env: ${coolifyEnvPath}`);
    }
  } catch (err) {
    console.warn(`[HostSync] Warning during host container synchronization: ${err.message}`);
  }
}

// ──────────────── Main Execution Flow ────────────────

async function main() {
  const options = parseArgs();
  const now = new Date();
  console.log(`[TokenRefresh] Execution started at ${now.toISOString()}`);

  // Mode: Check active token status
  if (options.check) {
    if (!fs.existsSync(options.tokenFile)) {
      console.log(`[TokenCheck] Token file not found at: ${options.tokenFile}`);
      process.exit(1);
    }
    const raw = fs.readFileSync(options.tokenFile, "utf-8");
    let token = raw;
    let expiresAt = null;
    try {
      const parsed = JSON.parse(raw);
      token = parsed.access_token || parsed.token || "";
      expiresAt = parsed.expires_at || null;
    } catch {
      /* raw token format */
    }

    const expInfo = decodeJwtExp(token);
    const expDate = expiresAt ? new Date(expiresAt) : expInfo?.expDate;

    if (!expDate || isNaN(expDate.getTime())) {
      console.log("[TokenCheck] Token expiration is UNKNOWN.");
      process.exit(1);
    }

    const remainingSec = Math.floor((expDate.getTime() - Date.now()) / 1000);
    if (remainingSec <= 0) {
      console.log(`[TokenCheck] Token has EXPIRED at ${expDate.toISOString()}`);
      process.exit(1);
    }

    const remainingHours = (remainingSec / 3600).toFixed(1);
    console.log(`[TokenCheck] Token is VALID until ${expDate.toISOString()} (~${remainingHours} hours remaining).`);
    process.exit(0);
  }

  // Check if current token in file is still valid (skip refresh unless --force is set)
  if (!options.force && !options.setToken && !options.authCode && fs.existsSync(options.tokenFile)) {
    try {
      const raw = fs.readFileSync(options.tokenFile, "utf-8");
      const parsed = JSON.parse(raw);
      const currentToken = parsed.access_token || parsed.token;
      const expInfo = decodeJwtExp(currentToken);
      if (expInfo?.expDate && expInfo.expDate.getTime() - Date.now() > 30 * 60 * 1000) {
        const remainingHours = ((expInfo.expDate.getTime() - Date.now()) / 3600000).toFixed(1);
        console.log(
          `[TokenRefresh] Active token at ${options.tokenFile} is still valid until ${expInfo.expDate.toISOString()} (~${remainingHours}h remaining). Use --force to refresh anyway.`,
        );
        process.exit(0);
      }
    } catch {
      /* proceed with refresh */
    }
  }

  let accessToken = null;
  let userId = null;
  let userName = null;
  let source = "upstox_totp_pipeline";

  // Mode: Set Token directly via CLI
  if (options.setToken) {
    console.log("[TokenRefresh] Storing directly provided token...");
    accessToken = options.setToken.trim();
    source = "cli_direct_set";
  }
  // Mode: Exchange OAuth Authorization Code
  else if (options.authCode) {
    if (!options.apiKey || !options.apiSecret) {
      throw new Error("Missing UPSTOX_API_KEY or UPSTOX_API_SECRET for authorization code exchange.");
    }
    console.log("[TokenRefresh] Exchanging authorization code for access token...");
    const result = await exchangeAuthCode({
      apiKey: options.apiKey,
      apiSecret: options.apiSecret,
      redirectUri: options.redirectUri,
      authCode: options.authCode,
    });
    accessToken = result.accessToken;
    userId = result.userId;
    userName = result.userName;
    source = "oauth_code_exchange";
  }
  // Mode: Headless TOTP Authentication
  else {
    if (!options.apiKey) throw new Error("Missing UPSTOX_API_KEY (provide via env or --api-key)");
    if (!options.pin) throw new Error("Missing UPSTOX_PIN (provide via env or --pin)");
    if (!options.totpSecret) throw new Error("Missing UPSTOX_TOTP_SECRET (provide via env or --totp-secret)");

    console.log("[TokenRefresh] Generating RFC 6238 TOTP passcode...");
    const totpCode = generateTotp(options.totpSecret);
    console.log("[TokenRefresh] TOTP generated successfully. Authenticating with Upstox TOTP API...");

    const result = await loginViaTotp({
      apiKey: options.apiKey,
      pin: options.pin,
      totpCode,
    });

    accessToken = result.accessToken;
    userId = result.userId;
    userName = result.userName;
    source = "automated_totp_refresh";
  }

  // Parse expiration
  const expInfo = decodeJwtExp(accessToken);
  const expIso = expInfo?.expDate ? expInfo.expDate.toISOString() : null;

  console.log(`[TokenRefresh] Successfully acquired access token.`);
  console.log(`[TokenRefresh] User: ${userId || expInfo?.sub || "N/A"}${userName ? ` (${userName})` : ""}`);
  console.log(`[TokenRefresh] Token Length: ${accessToken.length} bytes, Format: ${expInfo ? "JWT" : "OPAQUE"}`);
  console.log(`[TokenRefresh] Expires At: ${expIso || "UNKNOWN"}`);

  if (options.dryRun) {
    console.log("[TokenRefresh] Dry run enabled. Skipping file write.");
    process.exit(0);
  }

  // Save atomically to token file
  const payload = {
    access_token: accessToken,
    updated_at: new Date().toISOString(),
    expires_at: expIso,
    user_id: userId || expInfo?.sub || null,
    user_name: userName || null,
    source,
  };

  atomicWriteJson(options.tokenFile, payload);
  console.log(`[TokenRefresh] Saved token payload to: ${path.resolve(options.tokenFile)}`);

  // Synchronize host Docker container and Coolify .env if applicable
  syncHostDockerAndCoolify(accessToken);

  console.log("[TokenRefresh] Daily Upstox token refresh completed successfully.");
}

// Execute when run as CLI
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/i, "$1"))) {
  main().catch((err) => {
    console.error(`[TokenRefresh] FATAL ERROR: ${err.message}`);
    process.exit(1);
  });
}
