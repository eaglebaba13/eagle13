// Phase 3C-2 — Header bell surfacing unread alert count.

// Phase 3C-3 — Header bell with unread preview menu.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Bell, CheckCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  getSmartAlertUnreadCount,
  getSmartAlertEvents,
  markAllSmartAlertsRead,
} from "@/lib/smart-alerts/persistence.functions";

export function HeaderAlertBell() {
  const qc = useQueryClient();
  const countFn = useServerFn(getSmartAlertUnreadCount);
  const eventsFn = useServerFn(getSmartAlertEvents);
  const readAllFn = useServerFn(markAllSmartAlertsRead);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const { data } = useQuery({
    queryKey: ["smart-alerts", "unread-count"],
    queryFn: () => countFn(),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
  });
  const preview = useQuery({
    queryKey: ["smart-alerts", "preview"],
    queryFn: () => eventsFn({ data: { limit: 5, unreadOnly: true } }),
    enabled: open,
    staleTime: 15_000,
  });
  const readAll = useMutation({
    mutationFn: () => readAllFn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["smart-alerts"] }),
  });

  const count = data?.count ?? 0;

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
        aria-label={count > 0 ? `${count} unread alerts` : "Alerts"}
        className="relative inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/60 bg-background text-muted-foreground transition-colors hover:text-foreground"
        title="Alerts"
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
          aria-label="Alerts preview"
          className="absolute right-0 top-[calc(100%+6px)] z-50 w-[320px] max-w-[92vw] overflow-hidden rounded-lg border border-border/70 bg-popover text-popover-foreground shadow-lg"
        >
          <header className="flex items-center justify-between border-b border-border/60 px-3 py-2 text-xs">
            <span className="font-medium">Alerts</span>
            <button
              type="button"
              onClick={() => readAll.mutate()}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              aria-label="Mark all read"
            >
              <CheckCheck size={12} /> Mark all read
            </button>
          </header>
          <div className="max-h-[360px] overflow-y-auto">
            {preview.isLoading && <div className="p-3 text-xs text-muted-foreground">Loading…</div>}
            {preview.data && preview.data.length === 0 && (
              <div className="p-4 text-center text-xs text-muted-foreground">No unread alerts.</div>
            )}
            {(preview.data ?? []).map((r) => (
              <Link
                key={r.id}
                to="/alerts"
                onClick={() => setOpen(false)}
                className="block border-b border-border/40 px-3 py-2 text-xs hover:bg-muted/30"
              >
                <div className="flex items-center gap-2">
                  <span className="rounded border border-border/60 px-1 py-[1px] text-[10px] text-muted-foreground">
                    {r.priority}
                  </span>
                  <span className="truncate font-medium text-foreground">{r.title}</span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-muted-foreground">{r.summary}</p>
              </Link>
            ))}
          </div>
          <footer className="border-t border-border/60">
            <Link
              to="/alerts"
              onClick={() => setOpen(false)}
              className="block px-3 py-2 text-center text-xs text-primary hover:bg-muted/30"
            >
              View all alerts →
            </Link>
          </footer>
        </div>
      )}
    </div>
  );
}
