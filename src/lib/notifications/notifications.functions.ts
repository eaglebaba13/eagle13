// Phase 44 — Server functions for the Notification Center.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { NotificationRow, NotificationType } from "./types";

export interface ListNotificationsInput {
  readonly limit?: number;
  readonly unreadOnly?: boolean;
  readonly type?: NotificationType | null;
}

export const listNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: ListNotificationsInput | undefined) => data ?? {})
  .handler(async ({ data, context }): Promise<readonly NotificationRow[]> => {
    const limit = Math.min(Math.max(data.limit ?? 100, 1), 200);
    let q = context.supabase
      .from("notifications")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (data.unreadOnly) q = q.is("read_at", null);
    if (data.type) q = q.eq("type", data.type);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as NotificationRow[];
  });

export const getNotificationUnreadCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ count: number }> => {
    const { count, error } = await context.supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .is("read_at", null);
    if (error) throw new Error(error.message);
    return { count: count ?? 0 };
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }): Promise<NotificationRow> => {
    const { data: row, error } = await context.supabase.rpc(
      "mark_notification_read",
      { _id: data.id },
    );
    if (error) throw new Error(error.message);
    return row as unknown as NotificationRow;
  });

export const markAllNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ updated: number }> => {
    const { data, error } = await context.supabase.rpc(
      "mark_all_notifications_read",
    );
    if (error) throw new Error(error.message);
    return { updated: (data as unknown as number) ?? 0 };
  });

export const deleteNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("notifications")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true } as const;
  });