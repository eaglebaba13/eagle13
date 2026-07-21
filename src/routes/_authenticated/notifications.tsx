import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCheck, Trash2 } from "lucide-react";
import {
  deleteNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications/notifications.functions";
import {
  ALL_NOTIFICATION_TYPES,
  NOTIFICATION_TYPE_LABEL,
  NOTIFICATION_TYPE_TONE,
  type NotificationRow,
  type NotificationType,
} from "@/lib/notifications/types";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({ meta: [{ title: "Notifications — EagleBABA" }] }),
  component: NotificationsPage,
});

const TONE_CLASS: Record<"info" | "success" | "warn" | "danger", string> = {
  info: "border-border bg-muted/40 text-muted-foreground",
  success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-500",
  warn: "border-amber-500/40 bg-amber-500/10 text-amber-500",
  danger: "border-red-500/40 bg-red-500/10 text-red-500",
};

function NotificationsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listNotifications);
  const readOneFn = useServerFn(markNotificationRead);
  const readAllFn = useServerFn(markAllNotificationsRead);
  const deleteFn = useServerFn(deleteNotification);

  const [typeFilter, setTypeFilter] = useState<NotificationType | "ALL">("ALL");
  const [unreadOnly, setUnreadOnly] = useState(false);

  const q = useQuery({
    queryKey: ["notifications", "list", typeFilter, unreadOnly],
    queryFn: () =>
      listFn({
        data: {
          limit: 150,
          unreadOnly,
          type: typeFilter === "ALL" ? null : typeFilter,
        },
      }),
  });

  const readAll = useMutation({
    mutationFn: () => readAllFn(),
    onSuccess: () => {
      toast.success("All notifications marked read");
      void qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
  const readOne = useMutation({
    mutationFn: (id: string) => readOneFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const rows = q.data ?? [];
  const unreadCount = useMemo(() => rows.filter((r) => !r.read_at).length, [rows]);

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold">Notifications</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Signals, referral status and subscription events, in one place.
            </p>
          </div>
          <button
            type="button"
            onClick={() => readAll.mutate()}
            disabled={readAll.isPending || unreadCount === 0}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
          >
            <CheckCheck size={13} /> Mark all read
          </button>
        </header>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setTypeFilter("ALL")}
            className={pill(typeFilter === "ALL")}
          >
            All
          </button>
          {ALL_NOTIFICATION_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(t)}
              className={pill(typeFilter === t)}
            >
              {NOTIFICATION_TYPE_LABEL[t]}
            </button>
          ))}
          <label className="ml-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => setUnreadOnly(e.target.checked)}
            />
            Unread only
          </label>
        </div>

        <section className="rounded-xl border border-border bg-card">
          {q.isLoading ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="px-6 py-14 text-center text-sm text-muted-foreground">
              No notifications match this filter.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((r) => (
                <Row
                  key={r.id}
                  row={r}
                  onRead={() => readOne.mutate(r.id)}
                  onDelete={() => del.mutate(r.id)}
                  busy={readOne.isPending || del.isPending}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function pill(active: boolean) {
  return `rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
    active
      ? "border-primary bg-primary text-primary-foreground"
      : "border-border bg-card text-muted-foreground hover:bg-muted"
  }`;
}

function Row({
  row,
  onRead,
  onDelete,
  busy,
}: {
  row: NotificationRow;
  onRead: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const tone = TONE_CLASS[NOTIFICATION_TYPE_TONE[row.type]];
  const when = new Date(row.created_at).toLocaleString();
  const unread = !row.read_at;
  return (
    <li className={`grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3 sm:px-6 ${unread ? "bg-muted/20" : ""}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded border px-1.5 py-[1px] text-[10px] font-medium ${tone}`}>
            {NOTIFICATION_TYPE_LABEL[row.type]}
          </span>
          {row.link ? (
            <Link
              to={row.link as "/"}
              onClick={onRead}
              className="truncate text-sm font-medium text-foreground hover:underline"
            >
              {row.title}
            </Link>
          ) : (
            <span className="truncate text-sm font-medium text-foreground">{row.title}</span>
          )}
          {unread ? <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" aria-label="Unread" /> : null}
        </div>
        {row.body ? (
          <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{row.body}</p>
        ) : null}
        <p className="mt-1 text-[10px] text-muted-foreground">{when}</p>
      </div>
      <div className="flex shrink-0 items-start gap-1">
        {unread ? (
          <button
            type="button"
            onClick={onRead}
            disabled={busy}
            className="rounded-md border border-border px-2 py-1 text-[10px] hover:bg-muted disabled:opacity-50"
            aria-label="Mark read"
          >
            Mark read
          </button>
        ) : null}
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          className="inline-flex items-center justify-center rounded-md border border-border px-1.5 py-1 text-muted-foreground hover:bg-muted hover:text-red-500 disabled:opacity-50"
          aria-label="Delete"
          title="Delete"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </li>
  );
}