// Phase 44 — Unified Notification Center bell.
//
// Replaces / augments the smart-alert-only bell with the account-wide
// notification stream (signals + referrals + subscription events).

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Bell, CheckCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  getNotificationUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications/notifications.functions";
import {
  NOTIFICATION_TYPE_LABEL,
  NOTIFICATION_TYPE_TONE,
  type NotificationRow,
} from "@/lib/notifications/types";

const TONE_CLASS: Record<"info" | "success" | "warn" | "danger", string> = {
  info: "border-border bg-muted/40 text-muted-foreground",
  success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-500",
  warn: "border-amber-500/40 bg-amber-500/10 text-amber-500",
  danger: "border-red-500/40 bg-red-500/10 text-red-500",
};

export function NotificationBell() {
  const qc = useQueryClient();
  const countFn = useServerFn(getNotificationUnreadCount);
  const listFn = useServerFn(listNotifications);
  const readOneFn = useServerFn(markNotificationRead);
  const readAllFn = useServerFn(markAllNotificationsRead);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const { data: countData } = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => countFn(),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
  });
  const preview = useQuery({
    queryKey: ["notifications", "preview"],
    queryFn: () => listFn({ data: { limit: 6, unreadOnly: true } }),
    enabled: open,
    staleTime: 15_000,
  });

  const readAll = useMutation({
    mutationFn: () => readAllFn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const readOne = useMutation({
    mutationFn: (id: string) => readOneFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const count = countData?.count ?? 0;

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", handle);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={count > 0 ? `${count} unread notifications` : "Notifications"}
        className="relative inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/60 bg-background text-muted-foreground transition-colors hover:text-foreground"
        title="Notifications"
      >
        <Bell size={16} />
        {count > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-1 -right-1 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium text-white"
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Notification preview"
          className="absolute right-0 top-[calc(100%+6px)] z-50 w-[340px] max-w-[92vw] overflow-hidden rounded-lg border border-border/70 bg-popover text-popover-foreground shadow-lg"
        >
          <header className="flex items-center justify-between border-b border-border/60 px-3 py-2 text-xs">
            <span className="font-medium">Notifications</span>
            <button
              type="button"
              onClick={() => readAll.mutate()}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              aria-label="Mark all read"
            >
              <CheckCheck size={12} /> Mark all read
            </button>
          </header>
          <div className="max-h-[380px] overflow-y-auto">
            {preview.isLoading && (
              <div className="p-3 text-xs text-muted-foreground">Loading…</div>
            )}
            {preview.data && preview.data.length === 0 && (
              <div className="p-4 text-center text-xs text-muted-foreground">
                You're all caught up.
              </div>
            )}
            {(preview.data ?? []).map((r) => (
              <NotifRow key={r.id} row={r} onOpen={(id) => readOne.mutate(id)} onClose={() => setOpen(false)} />
            ))}
          </div>
          <footer className="border-t border-border/60">
            <Link
              to="/notifications"
              onClick={() => setOpen(false)}
              className="block px-3 py-2 text-center text-xs text-primary hover:bg-muted/30"
            >
              View all notifications →
            </Link>
          </footer>
        </div>
      )}
    </div>
  );
}

function NotifRow({
  row,
  onOpen,
  onClose,
}: {
  row: NotificationRow;
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const tone = TONE_CLASS[NOTIFICATION_TYPE_TONE[row.type]];
  const label = NOTIFICATION_TYPE_LABEL[row.type];
  const link = (row.link as "/notifications" | undefined) ?? "/notifications";
  return (
    <Link
      to={link}
      onClick={() => {
        onOpen(row.id);
        onClose();
      }}
      className="block border-b border-border/40 px-3 py-2 text-xs hover:bg-muted/30"
    >
      <div className="flex items-center gap-2">
        <span className={`rounded border px-1 py-[1px] text-[10px] ${tone}`}>{label}</span>
        <span className="truncate font-medium text-foreground">{row.title}</span>
      </div>
      {row.body ? (
        <p className="mt-0.5 line-clamp-2 text-muted-foreground">{row.body}</p>
      ) : null}
    </Link>
  );
}