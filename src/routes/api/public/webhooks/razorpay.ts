/**
 * Phase 20.3B — Razorpay webhook endpoint.
 *
 * Lives under /api/public/* so the published-site JWT gate does NOT apply.
 * Authentication is done entirely by HMAC-SHA256 signature over the RAW
 * request body. If Razorpay is not configured, we respond 200 to avoid
 * retries but NEVER mutate state.
 */
import { createFileRoute } from "@tanstack/react-router";
import {
  payloadHash,
  verifyRazorpayWebhookSignature,
} from "@/lib/razorpay-signature";
import { isSupportedEvent, decideEventOutcome } from "@/lib/razorpay-events";
import type { SubscriptionStatus } from "@/lib/plans";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/webhooks/razorpay")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { readRazorpayEnv } = await import("@/lib/razorpay-plan-map.server");
        const env = readRazorpayEnv();

        // Read RAW body FIRST — signature verification requires exact bytes.
        const rawBody = await request.text();
        const signature = request.headers.get("x-razorpay-signature");

        if (!env.webhookSecret) {
          return json({ ok: true, ignored: true, reason: "webhook_not_configured" });
        }

        const verified = verifyRazorpayWebhookSignature({
          rawBody,
          signatureHeader: signature,
          currentSecret: env.webhookSecret,
          previousSecret: env.webhookSecretPrevious,
        });
        if (!verified.verified) {
          return json({ ok: false, reason: verified.reason }, 401);
        }

        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(rawBody) as Record<string, unknown>;
        } catch {
          return json({ ok: false, reason: "invalid_json" }, 400);
        }

        const eventType = typeof payload.event === "string" ? payload.event : "";
        const digest = payloadHash(rawBody);
        const providerEventId =
          typeof payload.id === "string" && payload.id.length > 0
            ? payload.id
            : `sha256:${digest}`;
        const providerSubscriptionId = extractSubscriptionId(payload);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Idempotency by provider event ID.
        const { data: existing } = await supabaseAdmin
          .from("billing_events")
          .select("id, status")
          .eq("provider_event_id", providerEventId)
          .maybeSingle();
        if (existing) {
          return json({ ok: true, duplicate: true, status: existing.status });
        }

        const commonMeta = {
          environment: env.environment,
          provider_subscription_id: providerSubscriptionId,
          secret_version: verified.usedSecretVersion,
        };

        if (!isSupportedEvent(eventType)) {
          await supabaseAdmin.from("billing_events").insert({
            provider: "razorpay",
            provider_event_id: providerEventId,
            event_type: eventType,
            payload: payload as never,
            payload_hash: digest,
            signature_verified: true,
            status: "IGNORED",
            failure_reason: `unsupported_event:${eventType}`,
            idempotency_key: JSON.stringify(commonMeta),
          });
          return json({ ok: true, ignored: true });
        }

        // Resolve target subscription via stored provider IDs (never by email).
        let currentStatus: SubscriptionStatus | null = null;
        let targetUserId: string | null = null;
        if (providerSubscriptionId) {
          const { data: sub } = await supabaseAdmin
            .from("subscriptions")
            .select("user_id, status")
            .eq("provider_subscription_id", providerSubscriptionId)
            .maybeSingle();
          if (sub) {
            targetUserId = sub.user_id;
            currentStatus = sub.status as SubscriptionStatus;
          }
        }

        if (!currentStatus || !targetUserId) {
          await supabaseAdmin.from("billing_events").insert({
            provider: "razorpay",
            provider_event_id: providerEventId,
            event_type: eventType,
            payload: payload as never,
            payload_hash: digest,
            signature_verified: true,
            status: "FAILED",
            failure_reason: "no_matching_subscription",
            idempotency_key: JSON.stringify(commonMeta),
          });
          return json({ ok: true, unmatched: true });
        }

        const decision = decideEventOutcome(eventType, currentStatus);
        if (decision.action === "invalid_transition") {
          await supabaseAdmin.from("billing_events").insert({
            provider: "razorpay",
            provider_event_id: providerEventId,
            event_type: eventType,
            payload: payload as never,
            payload_hash: digest,
            signature_verified: true,
            status: "FAILED",
            failure_reason: `invalid_transition:${decision.from}->${decision.to}`,
            user_id: targetUserId,
            idempotency_key: JSON.stringify(commonMeta),
          });
          return json({ ok: true, invalidTransition: true });
        }

        if (decision.action === "transition") {
          await supabaseAdmin
            .from("subscriptions")
            .update({ status: decision.to, updated_at: new Date().toISOString() })
            .eq("user_id", targetUserId);
        }

        await supabaseAdmin.from("billing_events").insert({
          provider: "razorpay",
          provider_event_id: providerEventId,
          event_type: eventType,
          payload: payload as never,
          payload_hash: digest,
          signature_verified: true,
          status: "PROCESSED",
          user_id: targetUserId,
          processed_at: new Date().toISOString(),
          idempotency_key: JSON.stringify(commonMeta),
        });

        return json({ ok: true });
      },
    },
  },
});

function extractSubscriptionId(payload: Record<string, unknown>): string | null {
  const p = payload.payload as
    | {
        subscription?: { entity?: { id?: string } };
        payment?: { entity?: { subscription_id?: string } };
      }
    | undefined;
  return p?.subscription?.entity?.id ?? p?.payment?.entity?.subscription_id ?? null;
}