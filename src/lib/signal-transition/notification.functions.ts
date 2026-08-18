// Phase P1 — Signal Transition notification server function.
// Integrates with Supabase notifications table.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/lib/auth/require-supabase-auth";
import { buildSignalNotificationPayload } from "./notification";
import type { SignalTransition } from "./types";

/**
 * Persist a signal transition notification to the Supabase notifications table.
 * Uses the same table schema as existing notifications.
 */
export const persistSignalNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { signal: SignalTransition }) => data)
  .handler(async ({ data, context }): Promise<{ id: string; ok: true }> => {
    const payload = buildSignalNotificationPayload(data.signal);

    // Use raw insert matching the existing notification table schema.
    // The type field maps to NotificationType union via Supabase RPC.
    const { data: row, error } = await (context.supabase
      .from("notifications") as unknown as {
        insert: (row: Record<string, unknown>) => {
          select: (cols: string) => {
            single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
          };
        };
      })
      .insert({
        user_id: context.userId,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        link: payload.link,
        payload: payload.payload,
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return { id: row?.id ?? "", ok: true as const };
  });
