// Phase 44 — Server function for the Telegram Alert Log.
//
// Read-only view over `smart_alert_delivery_attempts` joined with the
// originating `smart_alert_events` (title, type). RLS restricts every
// SELECT to the current user's rows (admins see all via existing policy).

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

export const listAlertDeliveries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<readonly AlertDeliveryRow[]> => {
    const { data, error } = await context.supabase
      .from("smart_alert_delivery_attempts")
      .select(
        "id, event_id, fingerprint, provider, status, error_code, retryable, duration_ms, attempted_at, smart_alert_events(title, type, priority)",
      )
      .eq("user_id", context.userId)
      .order("attempted_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as unknown as Array<{
      id: string;
      event_id: string | null;
      fingerprint: string;
      provider: string;
      status: string;
      error_code: string | null;
      retryable: boolean;
      duration_ms: number | null;
      attempted_at: string;
      smart_alert_events: { title: string | null; type: string | null; priority: string | null } | null;
    }>;

    // Approximate retry count per fingerprint (attempts share fingerprint).
    const attemptsByFp = new Map<string, number>();
    for (const r of rows) {
      attemptsByFp.set(r.fingerprint, (attemptsByFp.get(r.fingerprint) ?? 0) + 1);
    }

    return rows.map((r) => ({
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
      retry_count: (attemptsByFp.get(r.fingerprint) ?? 1) - 1,
    }));
  });