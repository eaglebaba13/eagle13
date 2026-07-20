import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — EagleBABA" }] }),
  component: SettingsPage,
});

type Tab =
  | "general"
  | "appearance"
  | "notifications"
  | "trading"
  | "risk"
  | "broker"
  | "privacy"
  | "security"
  | "language";

const TABS: { id: Tab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "appearance", label: "Appearance" },
  { id: "notifications", label: "Notifications" },
  { id: "trading", label: "Trading" },
  { id: "risk", label: "Risk" },
  { id: "broker", label: "Broker" },
  { id: "privacy", label: "Privacy" },
  { id: "security", label: "Security" },
  { id: "language", label: "Language" },
];

type NotifPrefs = {
  browser: boolean;
  email: boolean;
  push: boolean;
  decision_alerts: boolean;
  risk_alerts: boolean;
  broker_status: boolean;
  portfolio_events: boolean;
};

const DEFAULT_NOTIFS: NotifPrefs = {
  browser: true,
  email: false,
  push: false,
  decision_alerts: true,
  risk_alerts: true,
  broker_status: true,
  portfolio_events: true,
};

function SettingsPage() {
  const { user, logAudit } = useAuth();
  const [tab, setTab] = useState<Tab>("general");
  const [notifs, setNotifs] = useState<NotifPrefs>(DEFAULT_NOTIFS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    void supabase
      .from("notification_preferences")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setNotifs({
            browser: data.browser,
            email: data.email,
            push: data.push,
            decision_alerts: data.decision_alerts,
            risk_alerts: data.risk_alerts,
            broker_status: data.broker_status,
            portfolio_events: data.portfolio_events,
          });
        }
      });
  }, [user]);

  async function saveNotifs() {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("notification_preferences")
        .upsert({ user_id: user.id, ...notifs });
      if (error) throw error;
      await logAudit("settings.notifications.update");
      toast.success("Notifications saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-8 grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6">
        <aside className="rounded-xl border border-border bg-card p-3 h-fit sticky top-4">
          <h1 className="px-2 pb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Settings
          </h1>
          <nav className="flex flex-col gap-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`text-left rounded-md px-3 py-2 text-sm transition ${
                  tab === t.id
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-foreground/80 hover:bg-muted"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="rounded-xl border border-border bg-card p-6 space-y-4">
          {tab === "notifications" ? (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Notifications</h2>
              {(Object.keys(notifs) as (keyof NotifPrefs)[]).map((k) => (
                <label key={k} className="flex items-center justify-between py-2 border-b border-border last:border-none">
                  <span className="text-sm capitalize">{k.replace(/_/g, " ")}</span>
                  <input
                    type="checkbox"
                    checked={notifs[k]}
                    onChange={(e) => setNotifs({ ...notifs, [k]: e.target.checked })}
                    className="h-4 w-4"
                  />
                </label>
              ))}
              <div className="flex justify-end pt-2">
                <button
                  onClick={saveNotifs}
                  disabled={saving}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold capitalize">{tab}</h2>
                <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
                  Settings · {tab}
                </p>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/40 p-4">
                <p className="text-sm text-muted-foreground">
                  {tab === "general" && "Manage core account preferences from your Profile page."}
                  {tab === "appearance" && "Theme is available in the top-right theme toggle."}
                  {tab === "trading" && "Trading defaults live in the Risk Manager and Decision Engine pages."}
                  {tab === "risk" && "Configure per-trade and daily loss limits inside the Risk Manager."}
                  {tab === "broker" && "Broker connections are managed on the Broker page."}
                  {tab === "privacy" && "Your journal, watchlists and settings are only visible to you."}
                  {tab === "security" && "Two-factor authentication and session management arrive in a future release."}
                  {tab === "language" && "Language switching is scheduled for a future release."}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Looking for something specific? Use the search in the top bar, or head to your
                Profile page for account-level controls.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}