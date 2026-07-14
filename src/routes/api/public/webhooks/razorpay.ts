/**
 * Phase 20.3B — Razorpay webhook endpoint.
 *
 * Path lives under /api/public/* so the published-site JWT gate does NOT
 * apply. Authentication is done entirely by HMAC-SHA256 signature over the
 * RAW request body. If Razorpay is not configured, we still respond 200 to
 * arbitrary posts so probing bots don't retry, but we NEVER mutate state.
 */
import { createFileRoute } from "@tanstack/react-router";
import {
  payloadHash,
  verifyRazorpayWebhookSignature,
} from "@/lib/razorpay-signature";
import { isSupportedEvent, decideEventOutcome } from "@/lib/razorpay-events";
import type { SubscriptionStatus } from "@/lib/plans";

export const Route = createFileRoute("/api/public/webhooks/razorpay")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { readRazorpayEnv } = await import("@/lib/razorpay-plan-map.server");
        const env = readRazorpayEnv();

        // Read the RAW body FIRST — signature verification must run on the
        // exact bytes Razorpay signed. Never parse before verifying.
        const rawBody = await request.text();
        const signature = request.headers.get("x-razorpay-signature");

        if (!env.webhookSecret) {
          // Not configured — swallow the request without mutation.
          return new Response(
            JSON.stringify({ ok: true, ignored: true, reason: "webhook_not_configured" }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }

        const verified = verifyRazorpayWebhookSignature({
          rawBody,
          signatureHeader: signature,
          currentSecret: env.webhookSecret,
          previousSecret: env.webhookSecretPrevious,
        });
        if (!verified.verified) {
          return new Response(JSON.stringify({ ok: false, reason: verified.reason }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }

        let payload: { event?: string; id?: string; payload?: unknown };
        try {
          payload = JSON.parse(rawBody);
        } catch {
          return new Response(JSON.stringify({ ok: false, reason: "invalid_json" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const event = String(payload.event ?? "");
        const eventId = typeof payload.id === "string" ? payload.id : null;
        const digest = payloadHash(rawBody);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Idempotency: if we've already recorded this provider event ID,
        // acknowledge without re-processing.
        if (eventId) {
          const { data: existing } = await supabaseAdmin
            .from("billing_events")
            .select("id, processed_status")
            .eq("provider_event_id", eventId)
            .maybeSingle();
          if (existing) {
            return new Response(
              JSON.stringify({ ok: true, duplicate: true, status: existing.processed_status }),
              { status: 200, headers: { "content-type": "application/json" } },
            );
          }
        }

        if (!isSupportedEvent(event)) {
          await supabaseAdmin.from("billing_events").insert({
            provider: "razorpay",
            provider_event_id: eventId,
            event_type: event,
            environment: env.environment,
            payload_hash: digest,
            signature_verified: true,
            processed_status: "IGNORED",
            failure_reason: `unsupported_event:${event}`,
          });
          return new Response(JSON.stringify({ ok: true, ignored: true }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }

        // Look up the subscription this event targets via stored provider IDs.
        const providerSubscriptionId = extractSubscriptionId(payload);
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

        if (!currentStatus) {
          await supabaseAdmin.from("billing_events").insert({
            provider: "razorpay",
            provider_event_id: eventId,
            event_type: event,
            environment: env.environment,
            payload_hash: digest,
            signature_verified: true,
            processed_status: "FAILED",
            failure_reason: "no_matching_subscription",
            provider_subscription_id: providerSubscriptionId,
          });
          // 200 so Razorpay does not retry indefinitely; admin reconciles.
          return new Response(JSON.stringify({ ok: true, unmatched: true }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }

        const decision = decideEventOutcome(event, currentStatus);
        if (decision.action === "invalid_transition") {
          await supabaseAdmin.from("billing_events").insert({
            provider: "razorpay",
            provider_event_id: eventId,
            event_type: event,
            environment: env.environment,
            payload_hash: digest,
            signature_verified: true,
            processed_status: "FAILED",
            failure_reason: `invalid_transition:${decision.from}->${decision.to}`,
            target_user_id: targetUserId,
            provider_subscription_id: providerSubscriptionId,
          });
          return new Response(JSON.stringify({ ok: true, invalidTransition: true }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }

        if (decision.action === "transition" && targetUserId) {
          await supabaseAdmin
            .from("subscriptions")
            .update({ status: decision.to, updated_at: new Date().toISOString() })
            .eq("user_id", targetUserId);
        }

        await supabaseAdmin.from("billing_events").insert({
          provider: "razorpay",
          provider_event_id: eventId,
          event_type: event,
          environment: env.environment,
          payload_hash: digest,
          signature_verified: true,
          processed_status: "PROCESSED",
          target_user_id: targetUserId,
          provider_subscription_id: providerSubscriptionId,
        });

        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});

function extractSubscriptionId(payload: {
  payload?: unknown;
}): string | null {
  try {
    const p = payload.payload as
      | { subscription?: { entity?: { id?: string } }; payment?: { entity?: { subscription_id?: string } } }
      | undefined;
    return (
      p?.subscription?.entity?.id ??
      p?.payment?.entity?.subscription_id ??
      null
    );
  } catch {
    return null;
  }
}