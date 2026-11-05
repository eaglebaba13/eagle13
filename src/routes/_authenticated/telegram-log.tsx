// Phase 44 — Telegram Alert Delivery Log.
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Send, RefreshCw, ArrowLeft } from "lucide-react";
import { listAlertDeliveries } from "@/lib/notifications/alert-delivery.functions";

export const Route = createFileRoute("/_authenticated/telegram-log")({
  head: () => ({ meta: [{ title: "Telegram Alert Log · Research Delivery · EagleBABA" }] }),
  component: TelegramLogPage,
});

function statusTone(s: string): string {
  const up = s.toUpperCase();
  if (up === "SUCCESS" || up === "DELIVERED" || up === "SENT")
    return "border-emerald-500/40 bg-emerald-500/15 text-emerald-300 font-mono";
  if (up === "FAILED" || up === "ERROR")
    return "border-rose-500/40 bg-rose-500/15 text-rose-300 font-mono";
  if (up === "RETRYING" || up === "PENDING" || up === "RETRY")
    return "border-amber-500/40 bg-amber-500/15 text-amber-300 font-mono";
  if (up === "DISABLED")
    return "border-zinc-700 bg-zinc-800/60 text-zinc-400 font-mono";
  return "border-zinc-800 bg-zinc-900/60 text-zinc-400 font-mono";
}

function TelegramLogPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAlertDeliveries);
  const q = useQuery({
    queryKey: ["alert-deliveries"],
    queryFn: () => listFn(),
    refetchInterval: 15_000,
  });
  const rows = q.data ?? [];

  return (
    <div className="w-full max-w-[1800px] mx-auto px-2 sm:px-4 lg:px-6 py-4 flex flex-col gap-4 overflow-x-hidden text-zinc-100">
      <header className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
        <div>
          <div className="text-[11px] font-mono font-bold tracking-wider text-amber-400 mb-1 flex items-center gap-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            TELEGRAM DISPATCH AUDIT · RESEARCH SIGNALS
          </div>
          <h1 className="flex items-center gap-2.5 text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-50">
            <Send className="text-amber-400" size={24} /> Telegram Alert Log
          </h1>
          <p className="mt-1 text-xs text-zinc-400 max-w-2xl">
            Real-time audit log of all Telegram alert and test dispatch attempts.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <a
            href="/alerts"
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700/80 bg-zinc-900/60 px-3.5 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800 hover:border-zinc-600 transition-all"
          >
            <ArrowLeft size={13} /> Back to Alert Center
          </a>
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ["alert-deliveries"] })}
            disabled={q.isFetching}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 hover:border-amber-500/50 transition-all shadow-[0_0_12px_rgba(245,158,11,0.1)] disabled:opacity-50"
          >
            <RefreshCw size={13} className={q.isFetching ? "animate-spin" : ""} /> Refresh log
          </button>
        </div>
      </header>

      <section className="card-institutional overflow-hidden p-0">
        {q.isLoading ? (
          <div className="px-6 py-14 text-center text-xs text-zinc-400 font-mono flex items-center justify-center gap-2">
            <RefreshCw size={14} className="animate-spin text-amber-400" />
            Loading Telegram delivery attempts…
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-zinc-400">
            No Telegram delivery attempts yet. Go to <a href="/alerts" className="text-amber-400 underline">Alert Center</a> and click <em>Send Test Telegram Ping</em>.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-zinc-950/80 text-[10px] uppercase font-mono tracking-wider text-amber-400/90 border-b border-zinc-800/80">
                <tr>
                  <th className="px-3.5 py-2.5 text-left">Time</th>
                  <th className="px-3.5 py-2.5 text-left">Signal ID</th>
                  <th className="px-3.5 py-2.5 text-left">Alert Type / Title</th>
                  <th className="px-3.5 py-2.5 text-left">Provider</th>
                  <th className="px-3.5 py-2.5 text-left">Status</th>
                  <th className="px-3.5 py-2.5 text-right">Retries</th>
                  <th className="px-3.5 py-2.5 text-right">Duration</th>
                  <th className="px-3.5 py-2.5 text-left">Error / Code</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 font-mono">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-amber-500/[0.03] transition-colors">
                    <td className="whitespace-nowrap px-3.5 py-2.5 text-zinc-300">
                      {new Date(r.attempted_at).toLocaleString()}
                    </td>
                    <td className="px-3.5 py-2.5 text-[11px] text-amber-400/80">
                      {r.fingerprint.slice(0, 16)}…
                    </td>
                    <td className="px-3.5 py-2.5 text-zinc-200">
                      <div className="font-semibold text-zinc-100">{r.event?.title ?? r.event?.type ?? "—"}</div>
                      {r.event?.type && <div className="text-[10px] text-zinc-500">{r.event.type}</div>}
                    </td>
                    <td className="px-3.5 py-2.5 text-zinc-300 font-semibold">{r.provider}</td>
                    <td className="px-3.5 py-2.5">
                      <span
                        className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${statusTone(r.status)}`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 text-right text-zinc-300">{r.retry_count}</td>
                    <td className="px-3.5 py-2.5 text-right text-zinc-400">
                      {r.duration_ms != null ? `${r.duration_ms}ms` : "—"}
                    </td>
                    <td className="px-3.5 py-2.5 text-rose-400 text-[11px] max-w-xs truncate">
                      {r.error_code ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
