/**
 * Phase 20.3A — Server-side entitlement guard.
 *
 * Trusted server function that decides whether the authenticated caller
 * may exercise a given capability RIGHT NOW. Never trust the browser for
 * this — every premium action should call `requireEntitlement` on the
 * server before performing work.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PLANS, planForRole, type Capability, type PlanId, type SubscriptionStatus } from "./plans";
import type { AppRole } from "./roles";

export interface EntitlementDecision {
  allowed: boolean;
  capability: Capability;
  effectivePlan: PlanId;
  subscriptionStatus: SubscriptionStatus | null;
  expiresAt: string | null;
  reason:
    | "ok"
    | "admin_override"
    | "granted"
    | "not_authenticated"
    | "no_subscription"
    | "plan_insufficient"
    | "trial_expired"
    | "subscription_expired"
    | "subscription_canceled"
    | "subscription_suspended";
  usage?: number;
  limit?: number;
}

const inputSchema = z.object({
  capability: z.string().min(1) as z.ZodType<Capability>,
});

export const requireEntitlement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => inputSchema.parse(v))
  .handler(async ({ data, context }): Promise<EntitlementDecision> => {
    const { supabase, userId } = context;
    const capability = data.capability;

    // Roles
    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const roles: AppRole[] = (roleRows ?? []).map((r) => r.role as AppRole);
    const isAdmin = roles.includes("admin");

    // Admin bypass
    if (isAdmin) {
      return {
        allowed: true,
        capability,
        effectivePlan: "enterprise",
        subscriptionStatus: "active",
        expiresAt: null,
        reason: "admin_override",
      };
    }

    // Temporary grants
    const nowIso = new Date().toISOString();
    const { data: grants } = await supabase
      .from("user_entitlement_grants")
      .select("capability,expires_at,revoked_at,starts_at")
      .eq("user_id", userId)
      .eq("capability", capability)
      .is("revoked_at", null);
    const activeGrant = (grants ?? []).find(
      (g) =>
        (g.starts_at === null || g.starts_at <= nowIso) &&
        (g.expires_at === null || g.expires_at > nowIso),
    );
    if (activeGrant) {
      return {
        allowed: true,
        capability,
        effectivePlan: planForRole(roles[0] ?? "free"),
        subscriptionStatus: "active",
        expiresAt: activeGrant.expires_at ?? null,
        reason: "granted",
      };
    }

    // Subscription
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("plan,status,trial_end,current_period_end")
      .eq("user_id", userId)
      .maybeSingle();

    const rolePlan = planForRole(roles.length ? roles[0] : "free");
    const subPlan = (sub?.plan ?? rolePlan) as PlanId;
    const status = (sub?.status ?? "active") as SubscriptionStatus;

    const now = Date.now();
    const trialExpired =
      status === "trialing" && sub?.trial_end
        ? new Date(sub.trial_end).getTime() < now
        : false;
    const periodExpired =
      status !== "trialing" && sub?.current_period_end
        ? new Date(sub.current_period_end).getTime() < now
        : false;

    let blocked: EntitlementDecision["reason"] | null = null;
    if (status === "canceled") blocked = "subscription_canceled";
    else if (status === "suspended") blocked = "subscription_suspended";
    else if (status === "expired") blocked = "subscription_expired";
    else if (trialExpired) blocked = "trial_expired";
    else if (periodExpired) blocked = "subscription_expired";

    const effectivePlan: PlanId = blocked ? "free" : subPlan;
    const capabilities = PLANS[effectivePlan].capabilities;

    if (capabilities.includes(capability)) {
      return {
        allowed: true,
        capability,
        effectivePlan,
        subscriptionStatus: status,
        expiresAt: sub?.current_period_end ?? sub?.trial_end ?? null,
        reason: blocked ?? "ok",
      };
    }

    return {
      allowed: false,
      capability,
      effectivePlan,
      subscriptionStatus: status,
      expiresAt: sub?.current_period_end ?? sub?.trial_end ?? null,
      reason: blocked ?? "plan_insufficient",
    };
  });