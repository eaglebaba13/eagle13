/**
 * Phase 20.3A — Client-side wrappers for the trusted server-side RPCs
 * (SECURITY DEFINER Postgres functions) that own every paid-state change.
 *
 * The authenticated Supabase client has NO direct INSERT/UPDATE grant on
 * `public.subscriptions`. Every plan / trial / status change MUST go
 * through one of these RPCs so it is auth-checked and audit-logged.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Capability } from "./plans";

export interface EntitlementSnapshot {
  user_id: string;
  roles: string[];
  subscription: {
    plan: string;
    status: string;
    trial_end: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    provider: string | null;
  } | null;
  grants: Array<{
    id: string;
    capability: string;
    expires_at: string | null;
    starts_at: string | null;
    revoked_at: string | null;
  }>;
  server_time: string;
}

/** Load the authoritative entitlement snapshot from the server. */
export async function fetchEntitlementSnapshot(
  targetUserId?: string,
): Promise<EntitlementSnapshot | null> {
  const { data, error } = await supabase.rpc("get_entitlement_snapshot", {
    _target: targetUserId,
  });
  if (error) throw error;
  return (data ?? null) as EntitlementSnapshot | null;
}

export async function selfStartTrial(plan: "pro" | "professional"): Promise<void> {
  const { error } = await supabase.rpc("self_start_trial", { _plan: plan });
  if (error) throw new Error(error.message);
}

export async function selfSetCancelAtPeriodEnd(flag: boolean): Promise<void> {
  const { error } = await supabase.rpc("self_set_cancel_at_period_end", { _flag: flag });
  if (error) throw new Error(error.message);
}

/**
 * Atomically consume a usage slot. Throws `usage_limit_exceeded` when the
 * user is at the plan cap. Callers MUST await this BEFORE performing the
 * gated action.
 */
export async function consumeUsage(
  resource: string,
  period: string,
  max: number,
): Promise<number> {
  const { data, error } = await supabase.rpc("consume_usage", {
    _resource: resource,
    _period: period,
    _max: max,
  });
  if (error) {
    if (error.message.includes("usage_limit_exceeded")) {
      throw new UsageLimitError(resource, period, max);
    }
    throw new Error(error.message);
  }
  return data as number;
}

export class UsageLimitError extends Error {
  constructor(
    public readonly resource: string,
    public readonly period: string,
    public readonly limit: number,
  ) {
    super(`usage_limit_exceeded:${resource}`);
    this.name = "UsageLimitError";
  }
}

// ---- Admin RPCs (server verifies role) ------------------------------------

export async function adminChangePlan(
  userId: string,
  plan: "free" | "pro" | "professional" | "enterprise",
  reason: string,
): Promise<void> {
  const { error } = await supabase.rpc("admin_change_plan", {
    _target: userId,
    _plan: plan,
    _reason: reason,
  });
  if (error) throw new Error(error.message);
}

export async function adminSetStatus(
  userId: string,
  status: string,
  reason: string,
): Promise<void> {
  const { error } = await supabase.rpc("admin_set_status", {
    _target: userId,
    _status: status,
    _reason: reason,
  });
  if (error) throw new Error(error.message);
}

export async function adminExtendTrial(
  userId: string,
  days: number,
  reason: string,
): Promise<void> {
  const { error } = await supabase.rpc("admin_extend_trial", {
    _target: userId,
    _days: days,
    _reason: reason,
  });
  if (error) throw new Error(error.message);
}

export async function adminGrantEntitlement(
  userId: string,
  capability: Capability,
  expiresAt: Date | null,
  reason: string,
): Promise<void> {
  const args = {
    _target: userId,
    _capability: capability,
    _expires_at: expiresAt ? expiresAt.toISOString() : (null as unknown as string),
    _reason: reason,
  };
  const { error } = await supabase.rpc("admin_grant_entitlement", args);
  if (error) throw new Error(error.message);
}

export async function adminRevokeEntitlement(grantId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc("admin_revoke_entitlement", {
    _grant_id: grantId,
    _reason: reason,
  });
  if (error) throw new Error(error.message);
}

export async function adminResetUsage(
  userId: string,
  resource: string,
  period: string,
  reason: string,
): Promise<void> {
  const { error } = await supabase.rpc("admin_reset_usage", {
    _target: userId,
    _resource: resource,
    _period: period,
    _reason: reason,
  });
  if (error) throw new Error(error.message);
}