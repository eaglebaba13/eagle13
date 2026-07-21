// Phase 44 — Signal History page.
//
// Renders the user's historical signal notifications
// (BUY CE / BUY PE / EXIT / HIGH RISK) with search + type filter.
// Purely a read view over the `notifications` table — no formula changes.

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { listNotifications } from "@/lib/notifications/notifications.functions";
import {
  NOTIFICATION_TYPE_LABEL,
  NOTIFICATION_TYPE_TONE,
  type NotificationType,
} from "@/lib/notifications/types";

export const Route = createFileRoute("/_authenticated/signal-history")({
  head: () => ({
    meta: [
      { title: "Signal History — EagleBABA" },
      { name: "description", content: "Historical BUY CE / BUY PE / EXIT / HIGH RISK signals with context." },
    ],
  }),
  component: SignalHistoryPage,
});

const SIGNAL_TYPES: readonly NotificationType[] = ["BUY_CE", "BUY_PE", "EXIT", "HIGH_RISK"];

const TONE_CLASS: Record<"info" | "success" | "warn" | "danger", string> = {
  info: "border-border bg-muted/40 text-muted-foreground",
  success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-500",
  warn: "border-amber-500/40 bg-amber-500/10 text-amber-500",
  danger: "border-red-500/40 bg-red-500/10 text-red-500",
};

function readNumber(payload: unknown, key: string): number | null {
  if (!payload || typeof payload !== "object") return null;
  const v = (payload as Record<string, unknown>)[key];
  return typeof v === "number" ? v : null;
}

function readString(payload: unknown, key: string): string | null {
  if (!payload || typeof payload !== "object") return null;
  const v = (payload as Record<string, unknown>)[key];
  return typeof v === "string" ? v : null;
}

function SignalHistoryPage() {
  const listFn = useServerFn(listNotifications);
  const [typeFilter, setTypeFilter] = useState<NotificationType | "ALL">("ALL");
  const [query, setQuery] = useState("");

  const q = useQuery({
    queryKey: ["signal-history", typeFilter],
    queryFn: async () => {
      // Server fn supports a single type filter; when ALL selected we fetch
      // a larger window and filter to the four signal types client-side.
      const rows = await listFn({
        data: {
          limit: 200,
          unreadOnly: false,
          type: typeFilter === "ALL" ? null : typeFilter,
        },
      });
      return typeFilter === "ALL"
        ? rows.filter((r) => SIGNAL_TYPES.includes(r.type))
        : rows;
    },
  });

  const rows = useMemo(() => {
    const base = q.data ?? [];
    if (!query.trim()) return base;
    const needle = query.trim().toLowerCase();
    return base.filter(
      (r) =>
        r.title.toLowerCase().includes(needle) ||
        (r.body ?? "").toLowerCase().includes(needle) ||
        (readString(r.payload, "instrument") ?? "").toLowerCase().includes(needle),
    );
  }, [q.data, query]);

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header>
          <h1 className="text-2xl font-semibold">Signal history</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every signal event delivered to your account, with the market context
            that produced it. Read-only — trading formulas are unchanged.
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setTypeFilter("ALL")} className={pill(typeFilter === "ALL")}>
            All signals
          </button>
          {SIGNAL_TYPES.map((t) => (
            <button key={t} type="button" onClick={() => setTypeFilter(t)} className={pill(typeFilter === t)}>
              {NOTIFICATION_TYPE_LABEL[t]}
            </button>
          ))}
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search instrument, title or body…"
            className="ml-auto w-full max-w-xs rounded-md border border-input bg-background px-3 py-1.5 text-xs"
          />
        </div>

        <section className="overflow-hidden rounded-xl border border-border bg-card">
          {q.isLoading ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="px-6 py-14 text-center text-sm text-muted-foreground">
              No signals match this filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Time</th>
                    <th className="px-3 py-2 text-left">Signal</th>
                    <th className="px-3 py-2 text-left">Instrument</th>
                    <th className="px-3 py-2 text-right">Confidence</th>
                    <th className="px-3 py-2 text-right">Spot</th>
                    <th className="px-3 py-2 text-right">VIX</th>
                    <th className="px-3 py-2 text-right">PCR</th>
                    <th className="px-3 py-2 text-right">Score</th>
                    <th className="px-3 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => {
                    const tone = TONE_CLASS[NOTIFICATION_TYPE_TONE[r.type]];
                    const status = readString(r.payload, "status") ?? "Live";
                    return (
                      <tr key={r.id} className="hover:bg-muted/20">
                        <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                          {new Date(r.created_at).toLocaleString()}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`rounded border px-1.5 py-[1px] text-[10px] font-medium ${tone}`}>
                            {NOTIFICATION_TYPE_LABEL[r.type]}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-medium text-foreground">
                          {readString(r.payload, "instrument") ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {fmtPct(readNumber(r.payload, "confidence"))}
                        </td>
                        <td className="px-3 py-2 text-right">{fmt(readNumber(r.payload, "spot"))}</td>
                        <td className="px-3 py-2 text-right">{fmt(readNumber(r.payload, "vix"))}</td>
                        <td className="px-3 py-2 text-right">{fmt(readNumber(r.payload, "pcr"))}</td>
                        <td className="px-3 py-2 text-right">{fmt(readNumber(r.payload, "score"))}</td>
                        <td className="px-3 py-2">
                          <span className="text-muted-foreground">{status}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function fmt(n: number | null): string {
  if (n === null || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function fmtPct(n: number | null): string {
  if (n === null || Number.isNaN(n)) return "—";
  return `${Math.round(n)}%`;
}

function pill(active: boolean) {
  return `rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
    active
      ? "border-primary bg-primary text-primary-foreground"
      : "border-border bg-card text-muted-foreground hover:bg-muted"
  }`;
}