// Phase 3C-2 — Compact dashboard widget for recent smart alerts.

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { BellRing } from "lucide-react";
import { getSmartAlertEvents } from "@/lib/smart-alerts/persistence.functions";
import type { AlertPriority } from "@/lib/smart-alerts/types";

const TONE: Record<AlertPriority, string> = {
  CRITICAL: "text-red-300",
  HIGH: "text-red-300",
  MEDIUM: "text-amber-300",
  LOW: "text-sky-300",
  INFO: "text-muted-foreground",
};

export function SmartAlertsWidget() {
  const fn = useServerFn(getSmartAlertEvents);
  const { data, isLoading, error } = useQuery({
    queryKey: ["smart-alerts-widget"],
    queryFn: () => fn({ data: { limit: 5 } }),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
  });

  return (
    <div className="rounded-lg border border-border/60 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <BellRing size={13} /> Smart Alerts
        </div>
        <Link to="/alerts" className="text-[11px] font-medium text-sky-300 hover:underline">
          Open →
        </Link>
      </div>
      {isLoading && <p className="mt-2 text-xs text-muted-foreground">Loading…</p>}
      {error && <p className="mt-2 text-xs text-red-300">Alerts unavailable</p>}
      {data && data.length === 0 && (
        <p className="mt-2 text-xs text-muted-foreground">No recent alerts.</p>
      )}
      <ul className="mt-2 space-y-1.5">
        {(data ?? []).slice(0, 5).map((e) => (
          <li key={e.id} className="text-xs">
            <span className={`mr-1 font-medium ${TONE[e.priority]}`}>{e.priority}</span>
            <span className="text-foreground">{e.title}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
