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
}

const inMemoryDeliveryLogs: AlertDeliveryRow[] = [];

export function recordDeliveryAttempt(row: AlertDeliveryRow): void {
  inMemoryDeliveryLogs.unshift(row);
  if (inMemoryDeliveryLogs.length > 100) {
    inMemoryDeliveryLogs.length = 100;
  }
}

export function getInMemoryDeliveryAttempts(): readonly AlertDeliveryRow[] {
  return inMemoryDeliveryLogs;
}

export const listAlertDeliveries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<readonly AlertDeliveryRow[]> => {
    assertAuth(context);
    if (!context.supabase) throw new Error("Unauthorized: Authentication required");
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
      if (!isGuest) {
        query = query.eq("user_id", userId);
      }
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
    } catch (err) {
      if (!isGuest && !(err as Error)?.message?.includes("42501")) {
        throw err;
      }
    }

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

    const existingIds = new Set(dbRows.map((r) => r.id));
    const combined = [
      ...inMemoryDeliveryLogs.filter((r) => !existingIds.has(r.id)),
      ...dbRows,
    ];

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
