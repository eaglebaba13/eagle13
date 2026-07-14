/**
 * Phase 20.2 — Cloud sync wiring.
 *
 * Thin wrappers around the Supabase tables from Phase 20.1 that let
 * user-scoped modules (risk settings, journal, watchlists, layouts, replay
 * presets, paper trades, notification prefs) push and pull data without
 * knowing the storage layer.
 *
 * Guest users: local-only, never touch cloud.
 * Auth users:  writes go to cloud, offline writes queue via offline-sync.ts.
 */
import { supabase } from "@/integrations/supabase/client";
import type { SubscriptionSnapshot } from "./entitlements";
import type { PlanId, SubscriptionStatus } from "./plans";

export const CLOUD_SCOPES = [
  "user_settings",
  "watchlists",
  "dashboard_layouts",
  "journal_entries",
  "paper_trades",
  "replay_presets",
  "notification_preferences",
  "risk_settings",
  "decision_preferences",
] as const;
export type CloudScope = (typeof CLOUD_SCOPES)[number];

// ---- Generic key/value in user_settings ----------------------------------

export async function readUserSettings<T = unknown>(userId: string): Promise<T | null> {
  const { data } = await supabase
    .from("user_settings")
    .select("settings")
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.settings as T) ?? null;
}

export async function writeUserSettings(userId: string, settings: unknown): Promise<void> {
  const payload = { user_id: userId, settings: settings as never };
  const { error } = await supabase
    .from("user_settings")
    .upsert(payload, { onConflict: "user_id" });
  if (error) throw error;
}

export async function patchUserSettings(
  userId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const current = (await readUserSettings<Record<string, unknown>>(userId)) ?? {};
  await writeUserSettings(userId, { ...current, ...patch });
}

// ---- Subscription snapshot ------------------------------------------------

interface SubscriptionRowFull {
  plan: string;
  status: string;
  trial_end: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  provider: string | null;
}

const KNOWN_PLANS = new Set(["free", "pro", "professional", "enterprise"]);
const KNOWN_STATUS = new Set([
  "trialing",
  "active",
  "past_due",
  "canceled",
  "expired",
  "suspended",
  "incomplete",
]);

export function rowToSnapshot(row: SubscriptionRowFull | null): SubscriptionSnapshot | null {
  if (!row) return null;
  const plan: PlanId = KNOWN_PLANS.has(row.plan) ? (row.plan as PlanId) : "free";
  const status: SubscriptionStatus = KNOWN_STATUS.has(row.status)
    ? (row.status as SubscriptionStatus)
    : "active";
  return {
    plan,
    status,
    trialEnd: row.trial_end ? new Date(row.trial_end) : null,
    currentPeriodEnd: row.current_period_end ? new Date(row.current_period_end) : null,
    cancelAtPeriodEnd: !!row.cancel_at_period_end,
    provider: row.provider,
  };
}

export async function fetchSubscriptionSnapshot(
  userId: string,
): Promise<SubscriptionSnapshot | null> {
  const { data } = await supabase
    .from("subscriptions")
    .select("plan,status,trial_end,current_period_end,cancel_at_period_end,provider")
    .eq("user_id", userId)
    .maybeSingle();
  return rowToSnapshot(data as unknown as SubscriptionRowFull | null);
}

// ---- Migration applied-set -----------------------------------------------

export async function fetchAppliedMigrations(userId: string): Promise<string[]> {
  const { data } = await supabase
    .from("local_migrations")
    .select("migration_key")
    .eq("user_id", userId);
  return (data ?? []).map((r) => r.migration_key as string);
}

export async function markMigrationApplied(userId: string, key: string): Promise<void> {
  const { error } = await supabase
    .from("local_migrations")
    .insert({ user_id: userId, migration_key: key });
  if (error && !String(error.message).toLowerCase().includes("duplicate")) throw error;
}

// ---- Usage counters -------------------------------------------------------

export async function readUsage(
  userId: string,
  resource: string,
  period: string,
): Promise<number> {
  const { data } = await supabase
    .from("usage_counters")
    .select("count")
    .eq("user_id", userId)
    .eq("resource", resource)
    .eq("period", period)
    .maybeSingle();
  return (data?.count as number) ?? 0;
}

export async function incrementUsage(
  userId: string,
  resource: string,
  period: string,
): Promise<number> {
  const current = await readUsage(userId, resource, period);
  const next = current + 1;
  const { error } = await supabase
    .from("usage_counters")
    .upsert(
      { user_id: userId, resource, period, count: next },
      { onConflict: "user_id,resource,period" },
    );
  if (error) throw error;
  return next;
}

// ---- Audit ---------------------------------------------------------------

export async function auditEvent(
  userId: string,
  event: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    await supabase
      .from("audit_log")
      .insert({ user_id: userId, event, metadata: metadata as never });
  } catch {
    /* audit is best-effort */
  }
}