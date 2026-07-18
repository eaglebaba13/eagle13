// Phase 3C-2 — Header bell surfacing unread alert count.

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { getSmartAlertUnreadCount } from "@/lib/smart-alerts/persistence.functions";

export function HeaderAlertBell() {
  const fn = useServerFn(getSmartAlertUnreadCount);
  const { data } = useQuery({
    queryKey: ["smart-alerts", "unread-count"],
    queryFn: () => fn(),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
  });
  const count = data?.count ?? 0;
  return (
    <Link
      to="/alerts"
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
    </Link>
  );
}
