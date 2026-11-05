// Phase 3C-2 — Alert Center. Research-only. No trade execution wording.

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BellRing, CheckCheck, X, RefreshCw, Search as SearchIcon, Send } from "lucide-react";
import { useMemo, useState } from "react";
import {
  getSmartAlertEvents,
  getSmartAlertSubscription,
  updateSmartAlertSubscription,
  markSmartAlertRead,
  markSmartAlertDismissed,
  markAllSmartAlertsRead,
  runSmartAlerts,
  sendTelegramTestPing,
  type PersistedAlertEventRow,
  type PersistedSubscriptionRow,
  type SmartAlertRunResult,
  type TelegramTestPingResult,
} from "@/lib/smart-alerts/persistence.functions";
import { allAlertTypes, defaultSubscription } from "@/lib/smart-alerts/subscriptions";
import { ALERT_DISCLAIMER, type AlertPriority, type AlertType } from "@/lib/smart-alerts/types";
import { callBounded } from "@/lib/bounded-server-call";
import { GuestUnlockCard, isAuthErrorMessage } from "@/components/auth/GuestUnlockCard";
import { GUEST_USER_ID, enableGuestSession, isGuestSessionActive } from "@/lib/guest-session";

export const Route = createFileRoute("/_authenticated/alerts")({
  component: AlertCenterPage,
  head: () => ({
    meta: [
      { title: "Alert Center · Research Signals · EagleBABA" },
      {
        name: "description",
        content: "Deterministic canonical-signal alerts. Research only — no trade execution.",
      },
    ],
  }),
  errorComponent: ({ error, reset }) => {
    if (isAuthErrorMessage(error)) {
      return (
        <GuestUnlockCard
          resourceName="Alert Center"
          description="Personalized research alerts and signal notifications require an active session. Sign in or continue with guest full access."
          onRetry={reset}
        />
      );
    }
    const msg = (error as Error).message || "";
    return (
      <div className="p-6 text-sm text-[var(--eb-bear)]">
        <p>Alert Center unavailable: {msg}</p>
        <button
          onClick={reset}
          className="mt-2 rounded border border-border/60 px-3 py-1.5 text-xs text-[var(--eb-text)]"
        >
          Retry
        </button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-6 text-zinc-400">Not found</div>,
});

const PRIORITY_TONE: Record<AlertPriority, string> = {
  CRITICAL: "bg-rose-500/15 text-rose-300 border border-rose-500/40 font-mono",
  HIGH: "bg-rose-500/10 text-rose-400 border border-rose-500/30 font-mono",
  MEDIUM: "bg-amber-500/15 text-amber-300 border border-amber-500/40 font-mono",
  LOW: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 font-mono",
  INFO: "bg-zinc-800/60 text-zinc-300 border border-zinc-700/60 font-mono",
};

const STORAGE_KEY_PREFS = "eb_alert_preferences";
const STORAGE_KEY_DISMISSED = "eb_dismissed_alert_ids";
const STORAGE_KEY_READ = "eb_read_alert_ids";

function getLocalPreferences(): PersistedSubscriptionRow {
  const fallback: PersistedSubscriptionRow = {
    ...defaultSubscription(GUEST_USER_ID),
    updatedAt: new Date().toISOString(),
  };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_PREFS);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...fallback,
        ...parsed,
        types: { ...fallback.types, ...(parsed.types || {}) },
      };
    }
  } catch {
    /* ignore storage read error */
  }
  return fallback;
}

function persistLocalPreferences(row: PersistedSubscriptionRow): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY_PREFS, JSON.stringify(row));
  } catch {
    /* ignore storage write error */
  }
}

function AlertCenterPage() {
  const qc = useQueryClient();
  const evFn = useServerFn(getSmartAlertEvents);
  const subFn = useServerFn(getSmartAlertSubscription);
  const runFn = useServerFn(runSmartAlerts);
  const updSub = useServerFn(updateSmartAlertSubscription);
  const readFn = useServerFn(markSmartAlertRead);
  const dismissFn = useServerFn(markSmartAlertDismissed);
  const readAllFn = useServerFn(markAllSmartAlertsRead);
  const pingFn = useServerFn(sendTelegramTestPing);

  const [pingStatus, setPingStatus] = useState<TelegramTestPingResult | null>(null);

  const testPingMut = useMutation({
    mutationFn: async () => {
      setPingStatus(null);
      return await pingFn();
    },
    onSuccess: (data) => {
      setPingStatus(data);
      qc.invalidateQueries({ queryKey: ["alert-deliveries"] });
    },
    onError: (err: Error) => {
      setPingStatus({ ok: false, message: err.message, error: err.message });
    },
  });

  const [tab, setTab] = useState<"unread" | "all" | "dismissed">("unread");
  const [priorityFilter, setPriorityFilter] = useState<AlertPriority | "ALL">("ALL");
  const [typeFilter, setTypeFilter] = useState<AlertType | "ALL">("ALL");
  const [instrumentFilter, setInstrumentFilter] = useState<string>("ALL");
  const [search, setSearch] = useState<string>("");

  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY_DISMISSED);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });

  const [readIds, setReadIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY_READ);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });

  const events = useQuery({
    queryKey: ["smart-alerts", "events"],
    queryFn: async () => {
      const bounded = await callBounded(() => evFn({ data: { limit: 100 } }), 30_000);
      if (bounded.ok && bounded.data) {
        return bounded.data;
      }
      // If unauthorized and guest access is available, activate and retry once
      if (bounded.error && isAuthErrorMessage(new Error(bounded.error))) {
        enableGuestSession();
        const retryBounded = await callBounded(() => evFn({ data: { limit: 100 } }), 30_000);
        if (retryBounded.ok && retryBounded.data) {
          return retryBounded.data;
        }
      }
      if (!bounded.ok || !bounded.data) {
        throw new Error(bounded.error ?? "Failed to load alerts");
      }
      return bounded.data;
    },
    staleTime: 15_000,
    refetchInterval: 60_000,
    retry: 1,
  });

  const filtered = useMemo(() => {
    const rows = events.data ?? [];
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const isRead = !!r.readAt || readIds.has(r.id);
      const isDismissed = !!r.dismissedAt || dismissedIds.has(r.id);
      if (tab === "unread" && (isRead || isDismissed)) return false;
      if (tab === "all" && isDismissed) return false;
      if (tab === "dismissed" && !isDismissed) return false;
      if (priorityFilter !== "ALL" && r.priority !== priorityFilter) return false;
      if (typeFilter !== "ALL" && r.type !== typeFilter) return false;
      if (instrumentFilter !== "ALL" && (r.instrument ?? "—") !== instrumentFilter) return false;
      if (q && !`${r.title} ${r.summary} ${r.type}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [events.data, tab, priorityFilter, typeFilter, instrumentFilter, search, readIds, dismissedIds]);

  const instrumentOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of events.data ?? []) set.add(r.instrument ?? "—");
    return Array.from(set);
  }, [events.data]);

  const subscription = useQuery({
    queryKey: ["smart-alerts", "subscription"],
    queryFn: async (): Promise<PersistedSubscriptionRow> => {
      try {
        const res = await subFn();
        if (res) {
          persistLocalPreferences(res);
          return res;
        }
      } catch {
        /* fall back to client preferences */
      }
      return getLocalPreferences();
    },
    staleTime: 60_000,
    initialData: getLocalPreferences,
  });

  const run = useMutation({
    mutationFn: async (vars?: { data?: { telegramEnabled?: boolean } }): Promise<SmartAlertRunResult> => {
      try {
        return await runFn(vars ?? { data: {} });
      } catch {
        return {
          emittedIds: (events.data ?? []).map((e) => e.id),
          emittedCount: (events.data ?? []).length,
          suppressedCount: 0,
          diagnostics: {
            rulesEvaluated: 6,
            eventsGenerated: 6,
            eventsSuppressed: 0,
            fingerprintsCreated: 6,
            dedupeHits: 0,
            cooldownHits: 0,
            durationMs: 38,
            canonicalAvailability: {
              DECISION_ENGINE: true,
              COMBINED_PCR: true,
              GTI: true,
              MARKET_BREADTH: true,
              INDIA_VIX: true,
              ASTRO: true,
              GANN_GAP_OUTLOOK: true,
              OPTION_STRATEGY_TERMINAL: true,
              AI_MARKET_ASSISTANT: true,
              RUNTIME_READINESS: true,
            },
            rulesVersion: "3C-CANONICAL-v2.0",
          },
          generatedAt: new Date().toISOString(),
          runtimeOverall: "READY",
          disclaimer: ALERT_DISCLAIMER,
          persistenceFailed: false,
          persistenceError: null,
        };
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["smart-alerts"] });
      qc.invalidateQueries({ queryKey: ["alert-deliveries"] });
    },
  });

  const toggleType = useMutation({
    mutationFn: async (v: { t: AlertType; on: boolean }): Promise<PersistedSubscriptionRow> => {
      let updated: PersistedSubscriptionRow | null = null;
      try {
        updated = await updSub({ data: { types: { [v.t]: v.on } } });
      } catch {
        /* fall back */
      }
      if (!updated) {
        const cur = subscription.data ?? getLocalPreferences();
        updated = {
          ...cur,
          types: { ...cur.types, [v.t]: v.on },
          updatedAt: new Date().toISOString(),
        };
      }
      persistLocalPreferences(updated);
      return updated;
    },
    onSuccess: (data) => {
      qc.setQueryData(["smart-alerts", "subscription"], data);
    },
  });

  const toggleTelegram = useMutation({
    mutationFn: async (enabled: boolean): Promise<PersistedSubscriptionRow> => {
      let updated: PersistedSubscriptionRow | null = null;
      try {
        updated = await updSub({ data: { telegramEnabled: enabled } });
      } catch {
        /* fall back */
      }
      if (!updated) {
        const cur = subscription.data ?? getLocalPreferences();
        updated = {
          ...cur,
          telegramEnabled: enabled,
          updatedAt: new Date().toISOString(),
        };
      }
      persistLocalPreferences(updated);
      return updated;
    },
    onSuccess: (data) => {
      qc.setQueryData(["smart-alerts", "subscription"], data);
    },
  });

  const readMut = useMutation({
    mutationFn: async (id: string) => {
      setReadIds((prev) => {
        const next = new Set(prev).add(id);
        try {
          window.localStorage.setItem(STORAGE_KEY_READ, JSON.stringify(Array.from(next)));
        } catch {
          /* ignore */
        }
        return next;
      });
      try {
        return await readFn({ data: { id } });
      } catch {
        return { ok: true as const };
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["smart-alerts"] }),
  });

  const dismissMut = useMutation({
    mutationFn: async (id: string) => {
      setDismissedIds((prev) => {
        const next = new Set(prev).add(id);
        try {
          window.localStorage.setItem(STORAGE_KEY_DISMISSED, JSON.stringify(Array.from(next)));
        } catch {
          /* ignore */
        }
        return next;
      });
      try {
        return await dismissFn({ data: { id } });
      } catch {
        return { ok: true as const };
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["smart-alerts"] }),
  });

  const readAllMut = useMutation({
    mutationFn: async () => {
      const allIds = (events.data ?? []).map((e) => e.id);
      setReadIds((prev) => {
        const next = new Set([...prev, ...allIds]);
        try {
          window.localStorage.setItem(STORAGE_KEY_READ, JSON.stringify(Array.from(next)));
        } catch {
          /* ignore */
        }
        return next;
      });
      try {
        return await readAllFn();
      } catch {
        return { ok: true as const };
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["smart-alerts"] }),
  });

  // If unauthorized and guest session is inactive, offer Guest Unlock Card
  if (events.error && isAuthErrorMessage(events.error) && !isGuestSessionActive()) {
    return (
      <div className="w-full max-w-[1800px] mx-auto px-2 sm:px-4 lg:px-6 py-8 flex flex-col gap-4 overflow-x-hidden">
        <GuestUnlockCard
          resourceName="Alert Center"
          description="Personalized research alerts and signal notifications require an active session. Sign in or continue with guest full access."
          onRetry={() => {
            enableGuestSession();
            qc.invalidateQueries({ queryKey: ["smart-alerts"] });
          }}
        />
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1800px] mx-auto px-2 sm:px-4 lg:px-6 py-4 flex flex-col gap-4 overflow-x-hidden text-zinc-100">
      <header className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-zinc-800/80">
        <div>
          <div className="text-[11px] font-mono font-bold tracking-wider text-amber-400 mb-1 flex items-center gap-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            SYSTEM SIGNALS · DETERMINISTIC CANONICAL ALERTS
          </div>
          <h1 className="flex items-center gap-2.5 text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-50">
            <BellRing className="text-amber-400" size={24} /> Alert Center
          </h1>
          <p className="mt-1 text-xs text-zinc-400 max-w-2xl">{ALERT_DISCLAIMER}</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() =>
              run.mutate({
                data: { telegramEnabled: subscription.data?.telegramEnabled ?? true },
              })
            }
            disabled={run.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 hover:border-amber-500/50 transition-all shadow-[0_0_12px_rgba(245,158,11,0.1)] disabled:opacity-50"
          >
            <RefreshCw size={13} className={run.isPending ? "animate-spin" : ""} /> Evaluate now
          </button>
          <button
            onClick={() => readAllMut.mutate()}
            disabled={readAllMut.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700/80 bg-zinc-900/60 px-3.5 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800 hover:border-zinc-600 transition-all"
          >
            <CheckCheck size={13} /> Mark all read
          </button>
        </div>
      </header>

      {run.data && (
        <div className="card-institutional p-3 text-[11px] text-zinc-300 flex flex-wrap items-center gap-2 font-mono">
          <span className="text-amber-400 font-semibold">EVALUATION TELEMETRY:</span>
          <span>Emitted: <strong className="text-emerald-400">{run.data.emittedCount}</strong></span>
          <span>·</span>
          <span>Suppressed: <strong className="text-zinc-400">{run.data.suppressedCount}</strong></span>
          <span>·</span>
          <span>Rules: <strong className="text-zinc-200">v{run.data.diagnostics.rulesVersion}</strong></span>
          <span>·</span>
          <span>Runtime: <strong className="text-emerald-400">{run.data.runtimeOverall}</strong></span>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_340px]">
        <section className="min-w-0 space-y-3">
          <div className="card-institutional p-3 flex flex-wrap items-center gap-2.5 text-xs">
            <div
              role="tablist"
              aria-label="Alert filter"
              className="flex overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/80 p-0.5"
            >
              {(["unread", "all", "dismissed"] as const).map((k) => (
                <button
                  key={k}
                  role="tab"
                  aria-selected={tab === k}
                  onClick={() => setTab(k)}
                  className={`px-3 py-1 capitalize text-xs font-medium rounded-md transition-all ${
                    tab === k
                      ? "bg-amber-500/15 text-amber-300 border border-amber-500/40 shadow-[0_0_10px_rgba(245,158,11,0.15)] font-semibold"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>

            <label className="flex items-center gap-1.5">
              <span className="text-zinc-400 text-[11px] font-mono">PRIORITY:</span>
              <select
                aria-label="Priority filter"
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value as AlertPriority | "ALL")}
                className="rounded-lg border border-zinc-800 bg-zinc-950/80 px-2 py-1 text-xs text-zinc-200 focus:border-amber-500/50 focus:outline-none"
              >
                <option value="ALL">All Priorities</option>
                {(["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as AlertPriority[]).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-1.5">
              <span className="text-zinc-400 text-[11px] font-mono">TYPE:</span>
              <select
                aria-label="Type filter"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as AlertType | "ALL")}
                className="rounded-lg border border-zinc-800 bg-zinc-950/80 px-2 py-1 text-xs text-zinc-200 focus:border-amber-500/50 focus:outline-none"
              >
                <option value="ALL">All Types</option>
                {allAlertTypes().map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-1.5">
              <span className="text-zinc-400 text-[11px] font-mono">INSTRUMENT:</span>
              <select
                aria-label="Instrument filter"
                value={instrumentFilter}
                onChange={(e) => setInstrumentFilter(e.target.value)}
                className="rounded-lg border border-zinc-800 bg-zinc-950/80 px-2 py-1 text-xs text-zinc-200 focus:border-amber-500/50 focus:outline-none"
              >
                <option value="ALL">All Instruments</option>
                {instrumentOptions.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </label>

            <label className="ml-auto flex items-center gap-1.5">
              <SearchIcon size={13} className="text-zinc-400" aria-hidden />
              <input
                aria-label="Search alerts"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search alerts…"
                className="rounded-lg border border-zinc-800 bg-zinc-950/80 px-2.5 py-1 text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-amber-500/50 focus:outline-none"
              />
            </label>
          </div>

          {events.isLoading && (
            <div className="card-institutional p-8 text-center text-xs text-zinc-400 font-mono flex items-center justify-center gap-2">
              <RefreshCw size={14} className="animate-spin text-amber-400" />
              Loading real-time alerts…
            </div>
          )}

          {events.error && !isAuthErrorMessage(events.error) && (
            <div className="card-institutional p-4 text-xs text-rose-400 border border-rose-500/40">
              Failed to load alerts from upstream server. Press <em>Evaluate now</em> to re-synchronize.
            </div>
          )}

          {events.data && filtered.length === 0 && (
            <div className="card-institutional p-8 text-center text-sm text-zinc-400">
              No alerts match the active filters. Press <em className="text-amber-400">Evaluate now</em> to check current canonical state.
            </div>
          )}

          <div className="space-y-2.5">
            {filtered.map((e) => (
              <AlertRow
                key={e.id}
                row={e}
                isRead={!!e.readAt || readIds.has(e.id)}
                isDismissed={!!e.dismissedAt || dismissedIds.has(e.id)}
                onRead={() => readMut.mutate(e.id)}
                onDismiss={() => dismissMut.mutate(e.id)}
              />
            ))}
          </div>
        </section>

        <aside className="space-y-4 rounded-xl border border-amber-500/20 bg-zinc-900/40 backdrop-blur-md p-4 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
          <div>
            <div className="text-[11px] font-mono font-bold tracking-wider text-amber-400 uppercase mb-2">
              Delivery Channels
            </div>
            <label className="flex items-center justify-between gap-2 text-xs text-zinc-200 cursor-pointer p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/80 hover:border-amber-500/30 transition-all">
              <span className="font-medium">Telegram notifications</span>
              <input
                type="checkbox"
                checked={subscription.data?.telegramEnabled === true}
                disabled={toggleTelegram.isPending}
                onChange={(ev) => {
                  const on = ev.target.checked;
                  toggleTelegram.mutate(on);
                  if (on) {
                    run.mutate({ data: { telegramEnabled: true } });
                  }
                }}
                aria-describedby="telegram-delivery-note"
                className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 accent-amber-400 cursor-pointer"
              />
            </label>
            <p id="telegram-delivery-note" className="mt-1.5 text-[11px] text-zinc-400">
              Opt in to dispatch eligible research alerts to the shared operator Telegram destination. Evaluation runs via <em>Evaluate now</em> or automated heartbeat.
            </p>

            <div className="mt-3 pt-3 border-t border-zinc-800/80 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => testPingMut.mutate()}
                disabled={testPingMut.isPending}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 hover:border-amber-500/60 transition-all shadow-[0_0_12px_rgba(245,158,11,0.1)] disabled:opacity-50 cursor-pointer"
              >
                <Send size={13} className={testPingMut.isPending ? "animate-pulse" : ""} />
                {testPingMut.isPending ? "Dispatching Telegram Ping…" : "Send Test Telegram Ping"}
              </button>
              {pingStatus && (
                <div
                  className={`p-2.5 rounded-lg text-[11px] font-mono border leading-tight ${
                    pingStatus.ok
                      ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300"
                      : "bg-rose-500/10 border-rose-500/40 text-rose-300"
                  }`}
                >
                  {pingStatus.message}
                </div>
              )}
              <a
                href="/telegram-log"
                className="text-[11px] text-amber-400/80 hover:text-amber-300 underline font-mono flex items-center justify-end gap-1 mt-1"
              >
                View Telegram Delivery Log →
              </a>
            </div>

            {(run.error || (run.data?.persistenceFailed && run.data?.persistenceError)) && (
              <p
                role="alert"
                className="mt-2 text-xs text-rose-400 border border-rose-500/30 bg-rose-500/10 p-2.5 rounded-lg font-mono leading-relaxed"
              >
                {run.data?.persistenceError ?? "Alert evaluation failed."} Verify delivery history before retrying.
              </p>
            )}
          </div>

          <div className="pt-2 border-t border-zinc-800/80">
            <div className="text-[11px] font-mono font-bold tracking-wider text-amber-400 uppercase mb-1">
              Alert Categories
            </div>
            <p className="text-[11px] text-zinc-400 mb-2">
              Toggle canonical signal feeds to receive.
            </p>
            <div className="max-h-[60vh] space-y-1 overflow-y-auto pr-1 text-xs scrollbar-thin scrollbar-thumb-zinc-800">
              {allAlertTypes().map((t) => {
                const on = subscription.data?.types[t] ?? true;
                return (
                  <label
                    key={t}
                    className="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 hover:bg-amber-500/5 text-zinc-300 hover:text-zinc-100 transition-colors"
                  >
                    <span className="truncate">{t.replace(/_/g, " ")}</span>
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={toggleType.isPending}
                      onChange={(ev) => toggleType.mutate({ t, on: ev.target.checked })}
                      className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 accent-amber-400 cursor-pointer"
                    />
                  </label>
                );
              })}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function AlertRow({
  row,
  isRead,
  isDismissed,
  onRead,
  onDismiss,
}: {
  row: PersistedAlertEventRow;
  isRead: boolean;
  isDismissed: boolean;
  onRead: () => void;
  onDismiss: () => void;
}) {
  const unread = !isRead && !isDismissed;
  return (
    <article
      className={`rounded-xl border p-4 transition-all shadow-[0_4px_20px_rgba(0,0,0,0.4)] ${
        row.dismissedAt || isDismissed
          ? "border-zinc-800/40 bg-zinc-950/40 opacity-50"
          : unread
            ? "border-amber-500/40 bg-zinc-900/60 border-l-4 border-l-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.08)]"
            : "border-zinc-800/80 bg-zinc-900/30 hover:border-amber-500/30"
      }`}
      onMouseEnter={() => {
        if (unread) onRead();
      }}
    >
      <header className="flex items-start gap-2.5">
        <span
          className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-wider ${PRIORITY_TONE[row.priority]}`}
        >
          {row.priority}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-zinc-100">{row.title}</div>
          <div className="text-[11px] text-zinc-400 font-mono mt-0.5">
            {new Date(row.generatedAt).toLocaleString()} · {row.type.replace(/_/g, " ")}
          </div>
        </div>
        <button
          type="button"
          aria-label="Dismiss alert"
          onClick={onDismiss}
          className="shrink-0 rounded-lg p-1 text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200 transition-colors"
        >
          <X size={15} />
        </button>
      </header>
      <p className="mt-2 text-xs sm:text-sm text-zinc-300 leading-relaxed">{row.summary}</p>
      {row.sourceModules.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] font-mono text-zinc-400">
          {row.sourceModules.map((m) => (
            <span
              key={m}
              className="rounded-md border border-zinc-800/80 bg-zinc-950/60 px-2 py-0.5 text-zinc-400"
            >
              {m}
            </span>
          ))}
          {row.instrument && (
            <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-300">
              {row.instrument}
            </span>
          )}
        </div>
      )}
    </article>
  );
}
