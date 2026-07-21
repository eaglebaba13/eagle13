// Phase 44 — Telegram Alert Delivery Log.
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAlertDeliveries } from "@/lib/notifications/alert-delivery.functions";

export const Route = createFileRoute("/_authenticated/telegram-log")({
  head: () => ({ meta: [{ title: "Telegram Alert Log — EagleBABA" }] }),
  component: TelegramLogPage,
});

function statusTone(s: string): string {
  const up = s.toUpperCase();
  if (up === "SUCCESS" || up === "DELIVERED" || up === "SENT")
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-500";
  if (up === "FAILED" || up === "ERROR") return "border-red-500/40 bg-red-500/10 text-red-500";
  if (up === "RETRYING" || up === "PENDING") return "border-amber-500/40 bg-amber-500/10 text-amber-500";
  return "border-border bg-muted/40 text-muted-foreground";
}

function TelegramLogPage() {
  const listFn = useServerFn(listAlertDeliveries);
  const q = useQuery({
    queryKey: ["alert-deliveries"],
    queryFn: () => listFn(),
  });
  const rows = q.data ?? [];
  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header>
          <h1 className="text-2xl font-semibold">Telegram alert log</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every alert Telegram delivery attempt for your account. Read-only.
          </p>
        </header>

        <section className="overflow-hidden rounded-xl border border-border bg-card">
          {q.isLoading ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="px-6 py-14 text-center text-sm text-muted-foreground">
              No Telegram delivery attempts yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Time</th>
                    <th className="px-3 py-2 text-left">Signal ID</th>
                    <th className="px-3 py-2 text-left">Alert type</th>
                    <th className="px-3 py-2 text-left">Provider</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-right">Retries</th>
                    <th className="px-3 py-2 text-right">Duration</th>
                    <th className="px-3 py-2 text-left">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/20">
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                        {new Date(r.attempted_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
                        {r.fingerprint.slice(0, 12)}…
                      </td>
                      <td className="px-3 py-2">{r.event?.type ?? "—"}</td>
                      <td className="px-3 py-2">{r.provider}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded border px-1.5 py-[1px] text-[10px] font-medium ${statusTone(r.status)}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">{r.retry_count}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">
                        {r.duration_ms != null ? `${r.duration_ms}ms` : "—"}
                      </td>
                      <td className="px-3 py-2 text-red-500">{r.error_code ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}