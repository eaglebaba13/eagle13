/**
 * Phase 20.3B — Razorpay webhook signature verification.
 *
 * Uses HMAC-SHA256 over the RAW request body with the webhook secret.
 * Supports "current + previous" secret during rotation windows. Never logs
 * the secret itself. Uses timing-safe comparison to defeat timing oracles.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export interface VerifyResult {
  verified: boolean;
  usedSecretVersion: "current" | "previous" | null;
  reason?: string;
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

function hmacHex(secret: string, rawBody: string): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

/**
 * Verify a Razorpay webhook signature.
 * Do not JSON.parse the body before calling this — Razorpay signs the raw bytes.
 */
export function verifyRazorpayWebhookSignature(input: {
  rawBody: string;
  signatureHeader: string | null;
  currentSecret: string | null;
  previousSecret?: string | null;
}): VerifyResult {
  const { rawBody, signatureHeader, currentSecret, previousSecret } = input;
  if (!signatureHeader) return { verified: false, usedSecretVersion: null, reason: "missing_signature" };
  if (!currentSecret) return { verified: false, usedSecretVersion: null, reason: "webhook_secret_not_configured" };

  if (safeEqualHex(hmacHex(currentSecret, rawBody), signatureHeader)) {
    return { verified: true, usedSecretVersion: "current" };
  }
  if (previousSecret && safeEqualHex(hmacHex(previousSecret, rawBody), signatureHeader)) {
    return { verified: true, usedSecretVersion: "previous" };
  }
  return { verified: false, usedSecretVersion: null, reason: "signature_mismatch" };
}

/** Payload hash used for idempotency & tamper detection when storing events. */
export function payloadHash(rawBody: string): string {
  return createHmac("sha256", "eaglebaba.payload.digest").update(rawBody, "utf8").digest("hex");
}