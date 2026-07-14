import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { ROLE_LABELS } from "@/lib/roles";
import { initials } from "@/lib/profile";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Profile — EagleBABA" }] }),
  component: ProfilePage,
});

const TIMEZONES = ["Asia/Kolkata", "UTC", "America/New_York", "Europe/London", "Asia/Singapore"];
const CURRENCIES = ["INR", "USD", "EUR", "GBP", "SGD"];
const INSTRUMENTS = ["NIFTY", "BANKNIFTY", "FINNIFTY", "SENSEX"];
const BROKERS = ["", "Zerodha", "Dhan", "Angel One", "Upstox", "Alice Blue"];

function ProfilePage() {
  const { profile, user, refreshProfile, role, logAudit } = useAuth();
  const [form, setForm] = useState({
    display_name: "",
    timezone: "Asia/Kolkata",
    country: "IN",
    currency: "INR",
    preferred_broker: "",
    preferred_instrument: "NIFTY",
    language: "en",
    theme: "dark",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({
        display_name: profile.displayName,
        timezone: profile.timezone,
        country: profile.country,
        currency: profile.currency,
        preferred_broker: profile.preferredBroker ?? "",
        preferred_instrument: profile.preferredInstrument,
        language: profile.language,
        theme: profile.theme,
      });
    }
  }, [profile]);

  async function save() {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("profiles").upsert({
        id: user.id,
        email: user.email,
        ...form,
        preferred_broker: form.preferred_broker || null,
      });
      if (error) throw error;
      await refreshProfile();
      await logAudit("profile.update");
      toast.success("Profile saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-xl font-semibold text-primary">
            {initials(profile?.displayName ?? "U")}
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Profile</h1>
            <p className="text-sm text-muted-foreground">
              {profile?.email} · <span className="font-medium">{ROLE_LABELS[role]}</span>
            </p>
          </div>
        </header>

        <section className="rounded-xl border border-border bg-card p-6 space-y-4">
          <Field label="Display name">
            <input
              value={form.display_name}
              onChange={(e) => setForm({ ...form, display_name: e.target.value })}
              className="input"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Timezone">
              <select
                value={form.timezone}
                onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                className="input"
              >
                {TIMEZONES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Currency">
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className="input"
              >
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Country">
              <input
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
                className="input"
              />
            </Field>
            <Field label="Language">
              <input
                value={form.language}
                onChange={(e) => setForm({ ...form, language: e.target.value })}
                className="input"
              />
            </Field>
            <Field label="Preferred instrument">
              <select
                value={form.preferred_instrument}
                onChange={(e) => setForm({ ...form, preferred_instrument: e.target.value })}
                className="input"
              >
                {INSTRUMENTS.map((i) => (
                  <option key={i}>{i}</option>
                ))}
              </select>
            </Field>
            <Field label="Preferred broker">
              <select
                value={form.preferred_broker}
                onChange={(e) => setForm({ ...form, preferred_broker: e.target.value })}
                className="input"
              >
                {BROKERS.map((b) => (
                  <option key={b} value={b}>
                    {b || "None"}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="flex justify-end">
            <button
              onClick={save}
              disabled={saving}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save profile"}
            </button>
          </div>
        </section>
      </div>

      <style>{`.input{width:100%;border:1px solid hsl(var(--input));background:hsl(var(--background));border-radius:0.375rem;padding:0.5rem 0.75rem;font-size:0.875rem;}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}