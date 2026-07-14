import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { verifyRazorpayWebhookSignature, payloadHash } from "./razorpay-signature";

function sign(secret: string, body: string) {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

describe("Razorpay signature verification", () => {
  const body = JSON.stringify({ event: "subscription.activated", id: "evt_1" });

  it("accepts a valid signature under the current secret", () => {
    const secret = "whsec_current";
    const res = verifyRazorpayWebhookSignature({
      rawBody: body,
      signatureHeader: sign(secret, body),
      currentSecret: secret,
    });
    expect(res.verified).toBe(true);
    expect(res.usedSecretVersion).toBe("current");
  });

  it("rejects an incorrect signature", () => {
    const res = verifyRazorpayWebhookSignature({
      rawBody: body,
      signatureHeader: sign("other", body),
      currentSecret: "whsec_current",
    });
    expect(res.verified).toBe(false);
    expect(res.reason).toBe("signature_mismatch");
  });

  it("falls back to previous secret during rotation", () => {
    const previous = "whsec_previous";
    const res = verifyRazorpayWebhookSignature({
      rawBody: body,
      signatureHeader: sign(previous, body),
      currentSecret: "whsec_new",
      previousSecret: previous,
    });
    expect(res.verified).toBe(true);
    expect(res.usedSecretVersion).toBe("previous");
  });

  it("rejects when no signature header is present", () => {
    const res = verifyRazorpayWebhookSignature({
      rawBody: body,
      signatureHeader: null,
      currentSecret: "whsec_current",
    });
    expect(res.verified).toBe(false);
    expect(res.reason).toBe("missing_signature");
  });

  it("rejects when secret is unconfigured (never trusts anonymous callers)", () => {
    const res = verifyRazorpayWebhookSignature({
      rawBody: body,
      signatureHeader: sign("x", body),
      currentSecret: null,
    });
    expect(res.verified).toBe(false);
    expect(res.reason).toBe("webhook_secret_not_configured");
  });

  it("detects tampered raw body under valid-looking signature (replay tamper)", () => {
    const secret = "whsec_current";
    const sig = sign(secret, body);
    const tampered = body.replace("evt_1", "evt_2");
    const res = verifyRazorpayWebhookSignature({
      rawBody: tampered,
      signatureHeader: sig,
      currentSecret: secret,
    });
    expect(res.verified).toBe(false);
  });

  it("payloadHash is deterministic and body-sensitive", () => {
    expect(payloadHash("a")).toBe(payloadHash("a"));
    expect(payloadHash("a")).not.toBe(payloadHash("b"));
  });
});