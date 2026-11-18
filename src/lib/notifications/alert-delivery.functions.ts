// Phase 44 â€” Server function for the Telegram Alert Log.
//
// Read-only view over `smart_alert_delivery_attempts` joined with the
// originating `smart_alert_events` (title, type). RLS restricts every
// SELECT to the current user's rows (admins see all via existing policy).

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth, assertAuth } from "@/integrations/supabase/auth-middleware";

export interface AlertDeliveryRow {
  readonly id: string;
  readonly event_id: string | null;
  readonly fingerprint: string;
  readonly provider: string;
  readonly status: string;
  readonly error_code: string | null;
  readonly retryable: boolean;
  readonly duration_ms: number | null;
  readonly attempted_at: string;
  readonly event: {
    readonly title: string | null;
    readonly type: string | null;
    readonly priority: string | null;
  } | null;
  readonly retry_count: number;
  readonly target_channel?: string | null;
}

const inMemoryDeliveryLogs: AlertDeliveryRow[] = [];
const deliveryOwners = new Map<string, string>();

export function recordDeliveryAttempt(row: AlertDeliveryRow, userId?: string): void {
  inMemoryDeliveryLogs.unshift(row);
  if (userId) deliveryOwners.set(row.id, userId);
  if (inMemoryDeliveryLogs.length > 100) {
    for (const old of inMemoryDeliveryLogs.slice(100)) deliveryOwners.delete(old.id);
    inMemoryDeliveryLogs.length = 100;
  }
}

export async function persistOperatorDelivery(row: AlertDeliveryRow, userId: string): Promise<boolean> {
  recordDeliveryAttempt(row, userId);
  try {
    const { persistDeliveryAudit } = await import("./delivery-audit.server");
    await persistDeliveryAudit(userId, row);
    return true;
  } catch { return false; }
}

export function getInMemoryDeliveryAttempts(): readonly AlertDeliveryRow[] {
  return inMemoryDeliveryLogs;
}

export const listAlertDeliveries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<readonly AlertDeliveryRow[]> => {
    assertAuth(context);
    const userId = context.userId;
    const isGuest = userId === "guest-researcher" || (context as { isGuest?: boolean }).isGuest;

    let rows: Array<{
      id: string;
      event_id: string | null;
      fingerprint: string;
      provider: string;
      status: string;
      error_code: string | null;
      retryable: boolean;
      duration_ms: number | null;
      attempted_at: string;
      smart_alert_events: {
        title: string | null;
        type: string | null;
        priority: string | null;
      } | null;
    }> = [];

    try {
      let query = context.supabase
        .from("smart_alert_delivery_attempts")
        .select(
          "id, event_id, fingerprint, provider, status, error_code, retryable, duration_ms, attempted_at, smart_alert_events(title, type, priority)",
        );
      query = query.eq("user_id", userId);
      const { data, error } = await query
        .order("attempted_at", { ascending: false })
        .limit(200);

      if (error) {
        if (!isGuest && (error as { code?: string })?.code !== "42501") {
          throw new Error(error.message);
        }
      } else if (data) {
        rows = data as unknown as typeof rows;
      }
    } catch { /* The scoped durable audit remains available when RLS or the database is down. */ }

    const dbRows: AlertDeliveryRow[] = rows.map((r) => ({
      id: r.id,
      event_id: r.event_id,
      fingerprint: r.fingerprint,
      provider: r.provider,
      status: r.status,
      error_code: r.error_code,
      retryable: r.retryable,
      duration_ms: r.duration_ms,
      attempted_at: r.attempted_at,
      event: r.smart_alert_events,
      retry_count: 0,
    }));

    const { readDeliveryAudit } = await import("./delivery-audit.server");
    const durableRows = await readDeliveryAudit(userId).catch(() => []);
    const byId = new Map(dbRows.map((row) => [row.id, row]));
    for (const row of [...durableRows, ...inMemoryDeliveryLogs.filter((row) => deliveryOwners.get(row.id) === userId)]) byId.set(row.id, row);
    const combined = [...byId.values()].sort((a, b) => b.attempted_at.localeCompare(a.attempted_at)).slice(0, 200);

    // Approximate retry count per fingerprint (attempts share fingerprint).
    const attemptsByFp = new Map<string, number>();
    for (const r of combined) {
      attemptsByFp.set(r.fingerprint, (attemptsByFp.get(r.fingerprint) ?? 0) + 1);
    }

    return combined.map((r) => ({
      ...r,
      retry_count: (attemptsByFp.get(r.fingerprint) ?? 1) - 1,
    }));
  });
