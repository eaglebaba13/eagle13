/**
 * Phase 20.3A — First-login local-data migration assistant.
 *
 * Detects legacy localStorage data left over from Phase 20.1 and earlier,
 * lets the user choose which scopes to import, previews record counts,
 * runs the cloud import per-scope with retry, and records every applied
 * migration key so we NEVER double-import.
 *
 * The local copy is kept until the cloud write succeeds. Scopes that fail
 * can be retried individually.
 */
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { LOCAL_KEYS, scanLocalData, type LocalDataSummary } from "@/lib/local-migration";
import {
  fetchAppliedMigrations,
  markMigrationApplied,
  writeUserSettings,
} from "@/lib/cloud-sync";
import { supabase } from "@/integrations/supabase/client";

const SCOPE_LABEL: Record<string, string> = {
  journal: "Journal",
  paperTrades: "Paper Trades",
  riskSettings: "Risk Settings",
  replayPresets: "Replay Presets",
  watchlists: "Watchlists",
  layouts: "Dashboard Layouts",
  notificationPrefs: "Notification Preferences",
  decisionPrefs: "Decision Preferences",
};

type Status = "idle" | "syncing" | "done" | "error";
interface Row extends LocalDataSummary {
  selected: boolean;
  status: Status;
  message?: string;
}

function safeRead(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function importScope(userId: string, row: LocalDataSummary): Promise<void> {
  const data = safeRead(row.key);
  if (data == null) return;

  switch (row.scope) {
    case "watchlists": {
      const list = Array.isArray(data) ? data : Object.values(data as object);
      for (const w of list as Array<Record<string, unknown>>) {
        await supabase.from("watchlists").insert({
          user_id: userId,
          name: String((w.name as string | undefined) ?? "Imported"),
          symbols: (w.symbols ?? w) as never,
          color: ((w.color as string | undefined) ?? "blue") as never,
          pinned: Boolean(w.pinned),
          sort_order: Number(w.sort_order ?? 0),
        } as never);
      }
      return;
    }
    case "journal": {
      const arr = Array.isArray(data) ? data : [];
      for (const e of arr as Array<Record<string, unknown>>) {
        await supabase.from("journal_entries").insert({
          user_id: userId,
          title: String(e.title ?? "Imported entry"),
          body: (e.body ?? e.content ?? {}) as never,
          tags: (e.tags ?? []) as never,
        } as never);
      }
      return;
    }
    case "paperTrades": {
      const arr = Array.isArray(data) ? data : [];
      for (const t of arr as Array<Record<string, unknown>>) {
        await supabase.from("paper_trades").insert({
          user_id: userId,
          payload: t as never,
        } as never);
      }
      return;
    }
    case "replayPresets": {
      const arr = Array.isArray(data) ? data : [];
      for (const p of arr as Array<Record<string, unknown>>) {
        await supabase.from("replay_presets").insert({
          user_id: userId,
          name: String(p.name ?? "Imported"),
          config: (p.config ?? p) as never,
        } as never);
      }
      return;
    }
    default: {
      // Preferences-style scopes go under user_settings JSON.
      const current = await supabase
        .from("user_settings")
        .select("settings")
        .eq("user_id", userId)
        .maybeSingle();
      const cur = (current.data?.settings as Record<string, unknown>) ?? {};
      await writeUserSettings(userId, { ...cur, [row.scope]: data });
      return;
    }
  }
}

export function MigrationAssistant() {
  const { user, isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user || !isAuthenticated || dismissed) return;
    if (typeof window === "undefined") return;
    if (localStorage.getItem(`eaglebaba.migration.skipped:${user.id}`) === "1") return;

    let cancelled = false;
    void (async () => {
      const found = scanLocalData(localStorage, user.id);
      if (!found.length) return;
      const applied = await fetchAppliedMigrations(user.id);
      const pending = found.filter((r) => !applied.includes(r.migrationKey));
      if (cancelled || !pending.length) return;
      setRows(
        pending.map((r) => ({ ...r, selected: true, status: "idle" as Status })),
      );
      setOpen(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isAuthenticated, dismissed]);

  const hasPending = rows.some((r) => r.status !== "done");
  const totalItems = useMemo(
    () => rows.reduce((a, r) => a + r.itemCount, 0),
    [rows],
  );

  if (!open || !user) return null;

  const toggle = (scope: string) =>
    setRows((rs) => rs.map((r) => (r.scope === scope ? { ...r, selected: !r.selected } : r)));

  const syncSelected = async () => {
    if (!user) return;
    for (const r of rows) {
      if (!r.selected || r.status === "done") continue;
      setRows((rs) => rs.map((x) => (x.scope === r.scope ? { ...x, status: "syncing" } : x)));
      try {
        await importScope(user.id, r);
        await markMigrationApplied(user.id, r.migrationKey);
        setRows((rs) =>
          rs.map((x) => (x.scope === r.scope ? { ...x, status: "done" } : x)),
        );
      } catch (err) {
        setRows((rs) =>
          rs.map((x) =>
            x.scope === r.scope
              ? { ...x, status: "error", message: (err as Error).message }
              : x,
          ),
        );
      }
    }
  };

  const skipForNow = () => {
    localStorage.setItem(`eaglebaba.migration.skipped:${user.id}`, "1");
    setDismissed(true);
    setOpen(false);
  };

  const keepLocal = () => {
    // Just mark all as applied so we never prompt again for these scopes.
    void (async () => {
      for (const r of rows) {
        await markMigrationApplied(user.id, r.migrationKey);
      }
      setDismissed(true);
      setOpen(false);
    })();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="migration-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-3"
    >
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-950 p-5 md:p-6 shadow-2xl">
        <h2 id="migration-title" className="text-lg font-semibold">
          Local data found
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          We found {totalItems} item{totalItems === 1 ? "" : "s"} saved on this device.
          Sync it to your cloud account so it works on every browser.
        </p>

        <ul className="mt-4 divide-y divide-white/5 rounded-md border border-white/5 max-h-72 overflow-auto">
          {rows.map((r) => (
            <li key={r.scope} className="flex items-center justify-between px-3 py-2 text-sm">
              <label className="flex items-center gap-3 min-w-0">
                <input
                  type="checkbox"
                  checked={r.selected}
                  onChange={() => toggle(r.scope)}
                  disabled={r.status === "syncing" || r.status === "done"}
                  className="accent-amber-400"
                />
                <span className="truncate">
                  <span className="font-medium">{SCOPE_LABEL[r.scope] ?? r.scope}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {r.itemCount} item{r.itemCount === 1 ? "" : "s"} · {Math.round(r.sizeBytes / 1024)} KB
                  </span>
                </span>
              </label>
              <span className="text-xs">
                {r.status === "syncing" && <span className="text-amber-300">Syncing…</span>}
                {r.status === "done" && <span className="text-emerald-400">Synced ✓</span>}
                {r.status === "error" && (
                  <span className="text-red-400" title={r.message}>
                    Failed
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={skipForNow}
            className="rounded-md border border-white/15 px-3 py-1.5 text-xs hover:bg-white/5"
          >
            Skip for now
          </button>
          <button
            type="button"
            onClick={keepLocal}
            className="rounded-md border border-white/15 px-3 py-1.5 text-xs hover:bg-white/5"
          >
            Keep local only
          </button>
          <button
            type="button"
            onClick={syncSelected}
            disabled={!rows.some((r) => r.selected && r.status !== "done")}
            className="rounded-md bg-amber-400/90 hover:bg-amber-400 disabled:opacity-50 px-4 py-1.5 text-xs font-semibold text-slate-900"
          >
            {hasPending ? "Sync selected" : "Done"}
          </button>
        </div>

        {!hasPending && (
          <p className="mt-3 text-xs text-emerald-400">
            All done. You can close this dialog.
          </p>
        )}
        <p className="mt-3 text-[10px] text-muted-foreground">
          Local copies are kept until each scope has synced successfully. Duplicate imports are
          prevented by migration IDs. Legacy keys: {Object.values(LOCAL_KEYS).length}.
        </p>
      </div>
    </div>
  );
}