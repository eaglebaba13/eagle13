import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useId } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useEntitlements } from "@/lib/use-entitlements";
import { ROLE_LABELS, type AppRole } from "@/lib/roles";
import { toast } from "sonner";
import {
  type ThemePreset,
  THEME_PRESETS,
} from "@/lib/admin/theme-studio.functions";
import {
  loadUserSettings,
  saveUserSettings,
  type UserPreferences,
} from "@/lib/user-settings";
import { getAudioNotificationManager } from "@/lib/audio-notifications";
import {
  User,
  Shield,
  Palette,
  Bell,
  Compass,
  Lock,
  KeyRound,
  Check,
  Smartphone,
  Mail,
  Eye,
  EyeOff,
  Volume2,
  VolumeX,
  Send,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Laptop,
  Globe,
  Sliders,
  ExternalLink,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings · Terminal Preferences — EagleBABA" }] }),
  component: SettingsPage,
});

type Tab = "general" | "appearance" | "notifications" | "trading" | "security";

interface TabItem {
  id: Tab;
  label: string;
  icon: typeof User;
  badge?: string;
  description: string;
}

const TABS: TabItem[] = [
  {
    id: "general",
    label: "General & Profile",
    icon: User,
    description: "Account identity, mobile verification, and plan entitlements",
  },
  {
    id: "appearance",
    label: "Appearance",
    icon: Palette,
    description: "Obsidian gold color palettes, layout density, and animations",
  },
  {
    id: "notifications",
    label: "Notifications",
    icon: Bell,
    description: "Gann level audio alerts, push banners, and Telegram broadcasts",
  },
  {
    id: "trading",
    label: "Trading & Analytics",
    icon: Compass,
    description: "Default index symbols, chart timeframe, and Gann harmonic angles",
  },
  {
    id: "security",
    label: "Security & Sessions",
    icon: KeyRound,
    description: "Password updates, multi-device sessions, and access logs",
  },
];

const THEME_OPTIONS: {
  id: Exclude<ThemePreset, "custom">;
  name: string;
  accent: string;
  bg: string;
  description: string;
}[] = [
  {
    id: "obsidian-gold",
    name: "Obsidian Gold",
    accent: "#f59e0b",
    bg: "#070a0e",
    description: "Canonical institutional amber gold on deep obsidian space",
  },
  {
    id: "cyber-cyan",
    name: "Cyber Cyan",
    accent: "#06b6d4",
    bg: "#060d17",
    description: "High-frequency neon cyan on oceanic dark background",
  },
  {
    id: "emerald-matrix",
    name: "Emerald Matrix",
    accent: "#10b981",
    bg: "#05100b",
    description: "Quant trading emerald highlights with deep pine tint",
  },
  {
    id: "royal-violet",
    name: "Royal Violet",
    accent: "#a855f7",
    bg: "#0b0714",
    description: "Institutional lavender violet on nocturnal amethyst base",
  },
  {
    id: "pure-black",
    name: "OLED Black",
    accent: "#f59e0b",
    bg: "#000000",
    description: "True zero-luminance black for OLED and low-glare trading",
  },
];

function SettingsPage() {
  const { user, profile, role, signOut, logAudit } = useAuth();
  const { effective } = useEntitlements();

  const [activeTab, setActiveTab] = useState<Tab>("general");
  const [preferences, setPreferences] = useState<UserPreferences>(loadUserSettings);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);

  // Profile Form State
  const [displayName, setDisplayName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");

  // Password Form State
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [signingOutOthers, setSigningOutOthers] = useState(false);

  // Sync initial user metadata & preferences
  useEffect(() => {
    setPreferences(loadUserSettings());
    if (user) {
      const meta = user.user_metadata || {};
      setDisplayName(profile?.displayName || meta.full_name || user.email?.split("@")[0] || "Trader");
      setMobileNumber(meta.phone || meta.mobile || "");
    }
  }, [user, profile]);

  // Handle live theme update
  const handleSelectTheme = (themeId: Exclude<ThemePreset, "custom">) => {
    const updated = saveUserSettings({ themePreset: themeId });
    setPreferences(updated);
    toast.success(`Theme updated to ${THEME_OPTIONS.find((t) => t.id === themeId)?.name}`);
  };

  // Save Profile Changes
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error("You must be signed in to update profile settings.");
      return;
    }
    setSavingProfile(true);
    try {
      // 1. Update Supabase Auth user metadata
      const { error: authError } = await supabase.auth.updateUser({
        data: {
          full_name: displayName.trim(),
          phone: mobileNumber.trim(),
        },
      });
      if (authError) throw authError;

      // 2. Update profiles table if row exists
      try {
        await supabase
          .from("profiles")
          .update({
            display_name: displayName.trim(),
          })
          .eq("id", user.id);
      } catch {
        // Continue if row not provisioned yet
      }

      await logAudit("settings.profile.update", {
        displayName: displayName.trim(),
        hasPhone: Boolean(mobileNumber),
      });

      toast.success("Profile updated successfully!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setSavingProfile(false);
    }
  };

  // Save General Preferences (Appearance, Notifications, Trading)
  const handleSavePreferences = (partial: Partial<UserPreferences>, successMessage: string) => {
    setSavingPrefs(true);
    try {
      const updated = saveUserSettings(partial);
      setPreferences(updated);

      // Sync Supabase notification_preferences if notification fields were updated
      if (user && (partial.desktopPush !== undefined || partial.telegramBroadcast !== undefined)) {
        void supabase
          .from("notification_preferences")
          .upsert({
            user_id: user.id,
            browser: updated.desktopPush,
            email: updated.emailAlerts,
            push: updated.desktopPush,
            broker_status: updated.brokerAlerts,
            decision_alerts: true,
            risk_alerts: true,
            portfolio_events: true,
          })
          .then();
      }

      toast.success(successMessage);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save preferences");
    } finally {
      setSavingPrefs(false);
    }
  };

  // Update Password
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 8) {
      toast.error("New password must be at least 8 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setUpdatingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;

      await logAudit("settings.security.password_change");
      toast.success("Password changed successfully! Keep your new credentials safe.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update password");
    } finally {
      setUpdatingPassword(false);
    }
  };

  // Sign out other devices
  const handleSignOutOtherDevices = async () => {
    setSigningOutOthers(true);
    try {
      const { error } = await supabase.auth.signOut({ scope: "others" });
      if (error) throw error;
      toast.success("Signed out from all other active sessions and devices.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to sign out other sessions");
    } finally {
      setSigningOutOthers(false);
    }
  };

  // Test sound
  const handleTestAudio = async () => {
    try {
      const audioMgr = getAudioNotificationManager();
      await audioMgr.play("RESEARCH_SIGNAL", `test-ping-${Date.now()}`);
      toast.info("Audio chime played. If you heard nothing, verify system volume and browser sound permissions.");
    } catch {
      toast.error("Could not play sound preview.");
    }
  };

  // Calculate password strength
  const getPasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, label: "Empty", color: "bg-zinc-700" };
    let score = 0;
    if (pass.length >= 8) score++;
    if (pass.length >= 12) score++;
    if (/[A-Z]/.test(pass) && /[a-z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;

    if (score <= 2) return { score, label: "Weak", color: "bg-rose-500" };
    if (score <= 3) return { score, label: "Moderate", color: "bg-amber-500" };
    if (score <= 4) return { score, label: "Strong", color: "bg-emerald-500" };
    return { score, label: "Institutional Grade", color: "bg-cyan-400" };
  };

  const passwordStrength = getPasswordStrength(newPassword);

  const getRoleBadgeStyle = (r: AppRole) => {
    switch (r) {
      case "superadmin":
        return "bg-amber-500/15 text-amber-300 border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.2)]";
      case "admin":
        return "bg-purple-500/15 text-purple-300 border-purple-500/40 shadow-[0_0_12px_rgba(168,85,247,0.2)]";
      case "pro":
      case "professional":
      case "enterprise":
        return "bg-emerald-500/15 text-emerald-300 border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.2)]";
      default:
        return "bg-zinc-800 text-zinc-300 border-zinc-700";
    }
  };

  const activeTabDetails = TABS.find((t) => t.id === activeTab)!;

  return (
    <div className="w-full max-w-[1400px] mx-auto px-3 sm:px-6 py-6 pb-32 md:pb-12 flex flex-col gap-6 text-zinc-100 font-sans">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-100 flex items-center gap-2.5">
            <span className="text-amber-400">⚙️</span>
            <span>Terminal Settings</span>
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-zinc-400">
            {activeTabDetails.description}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Active Session · Production v2
          </span>
        </div>
      </div>

      {/* Main Container: Split Layout on Desktop, Horizontal Tabs on Mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 items-start">
        {/* Navigation Tabs */}
        <aside className="w-full">
          {/* Mobile Horizontal Tabs */}
          <div className="flex lg:hidden overflow-x-auto scrollbar-none gap-2 pb-2 border-b border-zinc-800/80">
            {TABS.map((t) => {
              const Icon = t.icon;
              const isActive = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all border ${
                    isActive
                      ? "bg-amber-500/15 text-amber-300 border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.15)]"
                      : "bg-zinc-900/50 text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:border-zinc-700"
                  }`}
                >
                  <Icon size={14} className={isActive ? "text-amber-400" : "text-zinc-400"} />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>

          {/* Desktop Left Tab Menu */}
          <nav className="hidden lg:flex flex-col gap-1.5 card-institutional p-3 sticky top-6">
            <div className="px-3 py-2 text-[11px] font-mono font-semibold uppercase tracking-wider text-zinc-400">
              Navigation
            </div>
            {TABS.map((t) => {
              const Icon = t.icon;
              const isActive = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={`w-full flex items-center justify-between text-left px-3.5 py-2.5 rounded-lg text-sm transition-all border-l-2 ${
                    isActive
                      ? "bg-amber-500/15 text-amber-300 border-amber-400 font-semibold shadow-[0_0_12px_rgba(245,158,11,0.15)]"
                      : "text-zinc-400 border-transparent hover:text-zinc-200 hover:bg-zinc-800/50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon size={16} className={isActive ? "text-amber-400" : "text-zinc-400"} />
                    <span>{t.label}</span>
                  </div>
                  {isActive && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Tab Content Panes */}
        <main className="min-w-0 flex flex-col gap-6">
          {/* TAB 1: GENERAL & PROFILE */}
          {activeTab === "general" && (
            <div className="flex flex-col gap-6">
              {/* Profile Card */}
              <div className="card-institutional p-5 sm:p-6 flex flex-col gap-5">
                <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold text-base">
                      {displayName.charAt(0).toUpperCase() || "T"}
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-zinc-100">Operator Identity</h2>
                      <p className="text-xs text-zinc-400">Public research credentials &amp; contact verification</p>
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold uppercase tracking-wider border ${getRoleBadgeStyle(
                      role
                    )}`}
                  >
                    <Shield size={12} />
                    {ROLE_LABELS[role] || role}
                  </span>
                </div>

                <form onSubmit={handleSaveProfile} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Display Name */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-mono font-medium text-zinc-300 flex items-center gap-1.5">
                      <User size={13} className="text-amber-400" />
                      Display Name
                    </label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="e.g. Dheeraj Narula"
                      className="rounded-lg border border-zinc-800 bg-zinc-950/70 px-3.5 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400/50 transition-all"
                    />
                  </div>

                  {/* Email (Read-Only) */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-mono font-medium text-zinc-300 flex items-center gap-1.5">
                      <Mail size={13} className="text-amber-400" />
                      Email Address
                      <span className="text-[10px] text-zinc-500 font-sans">(Read-only)</span>
                    </label>
                    <div className="relative">
                      <input
                        type="email"
                        readOnly
                        value={user?.email || "operator@eaglebaba.in"}
                        className="w-full rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-3.5 py-2 text-sm text-zinc-400 cursor-not-allowed"
                      />
                      <Lock size={13} className="absolute right-3 top-3 text-zinc-500" />
                    </div>
                  </div>

                  {/* Mobile Number */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-mono font-medium text-zinc-300 flex items-center gap-1.5">
                      <Smartphone size={13} className="text-amber-400" />
                      Mobile / WhatsApp Number
                    </label>
                    <div className="flex gap-2">
                      <span className="inline-flex items-center px-3 rounded-lg border border-zinc-800 bg-zinc-900/60 text-xs font-mono text-zinc-400">
                        +91
                      </span>
                      <input
                        type="tel"
                        value={mobileNumber}
                        onChange={(e) => setMobileNumber(e.target.value)}
                        placeholder="10-digit number"
                        className="flex-1 rounded-lg border border-zinc-800 bg-zinc-950/70 px-3.5 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400/50 transition-all"
                      />
                    </div>
                  </div>

                  {/* Preferred Timezone */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-mono font-medium text-zinc-300 flex items-center gap-1.5">
                      <Globe size={13} className="text-amber-400" />
                      Market Timezone
                    </label>
                    <input
                      type="text"
                      readOnly
                      value="Asia/Kolkata (IST · UTC+05:30)"
                      className="rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-3.5 py-2 text-sm text-zinc-400 cursor-not-allowed font-mono"
                    />
                  </div>

                  <div className="md:col-span-2 flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={savingProfile}
                      className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-bold px-5 py-2 text-sm transition-all shadow-[0_0_12px_rgba(245,158,11,0.2)] disabled:opacity-60 cursor-pointer"
                    >
                      {savingProfile ? (
                        <>
                          <RefreshCw size={14} className="animate-spin" />
                          <span>Saving Profile…</span>
                        </>
                      ) : (
                        <>
                          <Check size={14} />
                          <span>Save Profile Changes</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>

              {/* Subscription & Entitlements Card */}
              <div className="card-institutional p-5 sm:p-6 flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
                  <div>
                    <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                      <Sparkles size={16} className="text-amber-400" />
                      Active License &amp; Entitlements
                    </h2>
                    <p className="text-xs text-zinc-400">Subscription plan tier, capabilities, and expiration</p>
                  </div>
                  <Link
                    to={role === "superadmin" || role === "admin" ? "/admin/plans" : "/billing"}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 hover:border-amber-500/60 transition-all shadow-[0_0_10px_rgba(245,158,11,0.15)]"
                  >
                    <span>Upgrade / Manage Plan</span>
                    <ExternalLink size={12} />
                  </Link>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-lg bg-zinc-950/60 border border-zinc-800 flex flex-col gap-1">
                    <span className="text-[10px] font-mono uppercase text-zinc-400">Current Plan</span>
                    <span className="text-sm font-bold text-amber-300">
                      {role === "superadmin" || role === "admin"
                        ? "Institutional Superadmin Lifetime"
                        : effective.plan?.name || "Professional Tier"}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-lg bg-zinc-950/60 border border-zinc-800 flex flex-col gap-1">
                    <span className="text-[10px] font-mono uppercase text-zinc-400">Status</span>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span className="text-sm font-bold text-emerald-400 capitalize">
                        {role === "superadmin" || role === "admin" ? "Active (Perpetual)" : effective.status || "Active"}
                      </span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-lg bg-zinc-950/60 border border-zinc-800 flex flex-col gap-1">
                    <span className="text-[10px] font-mono uppercase text-zinc-400">License Expiration</span>
                    <span className="text-sm font-bold text-zinc-200">
                      {role === "superadmin" || role === "admin"
                        ? "Lifetime Perpetual"
                        : effective.renewsAt
                          ? new Date(effective.renewsAt).toLocaleDateString("en-IN")
                          : "30 Days Active Trial"}
                    </span>
                  </div>
                </div>

                <div className="mt-1 flex flex-wrap gap-2 text-xs font-mono text-zinc-400">
                  <span className="px-2.5 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300">
                    ✓ Sub-second SSE Upstox V3 Streaming
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300">
                    ✓ Full Gann Wheel of 9 Level Calculator
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300">
                    ✓ Live Options Chain (PCR &amp; Max Pain)
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300">
                    ✓ AI Market Assistant Pro
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: APPEARANCE */}
          {activeTab === "appearance" && (
            <div className="flex flex-col gap-6">
              {/* Theme Studio Card */}
              <div className="card-institutional p-5 sm:p-6 flex flex-col gap-5">
                <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
                  <div>
                    <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                      <Palette size={16} className="text-amber-400" />
                      Visual Identity &amp; Themes
                    </h2>
                    <p className="text-xs text-zinc-400">
                      Real-time luxury palettes designed for low-glare institutional trading
                    </p>
                  </div>
                  <span className="text-xs font-mono text-amber-400">Instant Preview Active</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
                  {THEME_OPTIONS.map((theme) => {
                    const isSelected = preferences.themePreset === theme.id;
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        onClick={() => handleSelectTheme(theme.id)}
                        className={`text-left p-4 rounded-xl border transition-all flex flex-col justify-between gap-3 ${
                          isSelected
                            ? "border-amber-400 bg-zinc-900/90 shadow-[0_0_16px_rgba(245,158,11,0.25)] ring-1 ring-amber-400/50"
                            : "border-zinc-800/80 bg-zinc-950/60 hover:border-zinc-700 hover:bg-zinc-900/40"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <span
                              className="w-5 h-5 rounded-full border border-white/20 shadow-sm"
                              style={{ backgroundColor: theme.accent }}
                            />
                            <span className="text-sm font-bold text-zinc-100">{theme.name}</span>
                          </div>
                          {isSelected && <CheckCircle2 size={16} className="text-amber-400" />}
                        </div>
                        <p className="text-xs text-zinc-400 line-clamp-2">{theme.description}</p>
                        <div
                          className="h-2 w-full rounded-full overflow-hidden"
                          style={{
                            background: `linear-gradient(90deg, ${theme.bg} 0%, ${theme.accent} 100%)`,
                          }}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Layout & Density Options */}
              <div className="card-institutional p-5 sm:p-6 flex flex-col gap-5">
                <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2 border-b border-zinc-800/80 pb-3">
                  <Sliders size={16} className="text-amber-400" />
                  Layout Density &amp; Number Formatting
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Compact Mode Toggle */}
                  <label className="flex items-start justify-between gap-3 p-3.5 rounded-lg bg-zinc-950/60 border border-zinc-800/80 cursor-pointer hover:border-amber-500/30 transition-all">
                    <div>
                      <div className="text-sm font-semibold text-zinc-200">Compact Density Mode</div>
                      <div className="text-xs text-zinc-400 mt-0.5">
                        Reduces card margins and row padding for dense multi-monitor viewing.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={preferences.compactMode}
                      onChange={(e) =>
                        handleSavePreferences(
                          { compactMode: e.target.checked },
                          `Compact mode ${e.target.checked ? "enabled" : "disabled"}`
                        )
                      }
                      className="mt-1 h-4 w-4 rounded border-zinc-700 bg-zinc-900 accent-amber-400 cursor-pointer"
                    />
                  </label>

                  {/* Chart Animations Toggle */}
                  <label className="flex items-start justify-between gap-3 p-3.5 rounded-lg bg-zinc-950/60 border border-zinc-800/80 cursor-pointer hover:border-amber-500/30 transition-all">
                    <div>
                      <div className="text-sm font-semibold text-zinc-200">Smooth Chart Animations</div>
                      <div className="text-xs text-zinc-400 mt-0.5">
                        Enables candle interpolations. Disable to reduce GPU load on low-power devices.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={preferences.chartAnimations}
                      onChange={(e) =>
                        handleSavePreferences(
                          { chartAnimations: e.target.checked },
                          `Chart animations ${e.target.checked ? "enabled" : "disabled"}`
                        )
                      }
                      className="mt-1 h-4 w-4 rounded border-zinc-700 bg-zinc-900 accent-amber-400 cursor-pointer"
                    />
                  </label>

                  {/* Number Formatting Option */}
                  <div className="md:col-span-2 flex flex-col gap-2 p-3.5 rounded-lg bg-zinc-950/60 border border-zinc-800/80">
                    <label className="text-sm font-semibold text-zinc-200">Number &amp; Currency Format</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
                      <button
                        type="button"
                        onClick={() =>
                          handleSavePreferences({ numberFormat: "inr" }, "Number format set to Indian Lakhs/Crores")
                        }
                        className={`text-left p-3 rounded-lg border text-xs transition-all ${
                          preferences.numberFormat === "inr"
                            ? "bg-amber-500/15 border-amber-400/60 text-amber-200 font-medium"
                            : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                        }`}
                      >
                        <div className="font-bold text-sm">Indian Format (Lakhs &amp; Crores)</div>
                        <div className="font-mono text-zinc-400 mt-0.5">₹1,23,456.78 · 1.50 Cr</div>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          handleSavePreferences({ numberFormat: "intl" }, "Number format set to International Millions")
                        }
                        className={`text-left p-3 rounded-lg border text-xs transition-all ${
                          preferences.numberFormat === "intl"
                            ? "bg-amber-500/15 border-amber-400/60 text-amber-200 font-medium"
                            : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                        }`}
                      >
                        <div className="font-bold text-sm">International Format (Millions/Billions)</div>
                        <div className="font-mono text-zinc-400 mt-0.5">$123,456.78 · 15.00 M</div>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: NOTIFICATIONS */}
          {activeTab === "notifications" && (
            <div className="flex flex-col gap-6">
              {/* Sound Notifications */}
              <div className="card-institutional p-5 sm:p-6 flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
                  <div>
                    <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                      <Volume2 size={16} className="text-amber-400" />
                      Audio Chimes &amp; Sound Alerts
                    </h2>
                    <p className="text-xs text-zinc-400">Auditory signals when Gann harmonics trigger</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleTestAudio}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-900 text-xs font-semibold text-zinc-300 hover:border-amber-400 hover:text-amber-300 transition-all cursor-pointer"
                  >
                    <span>Test Chime</span>
                    <Sparkles size={12} />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <label className="flex items-center justify-between p-3 rounded-lg bg-zinc-950/60 border border-zinc-800 cursor-pointer hover:border-amber-500/30 transition-all">
                    <div>
                      <div className="text-sm font-semibold text-zinc-200">Master Audio</div>
                      <div className="text-[11px] text-zinc-400">Enable audio engine</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={preferences.soundAlerts}
                      onChange={(e) =>
                        handleSavePreferences(
                          { soundAlerts: e.target.checked },
                          `Sound alerts ${e.target.checked ? "enabled" : "muted"}`
                        )
                      }
                      className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 accent-amber-400 cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 rounded-lg bg-zinc-950/60 border border-zinc-800 cursor-pointer hover:border-amber-500/30 transition-all">
                    <div>
                      <div className="text-sm font-semibold text-zinc-200">Gann Setup Chime</div>
                      <div className="text-[11px] text-zinc-400">Eagle breakout sound</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={preferences.signalSounds}
                      onChange={(e) =>
                        handleSavePreferences(
                          { signalSounds: e.target.checked },
                          `Signal sounds ${e.target.checked ? "enabled" : "disabled"}`
                        )
                      }
                      className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 accent-amber-400 cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 rounded-lg bg-zinc-950/60 border border-zinc-800 cursor-pointer hover:border-amber-500/30 transition-all">
                    <div>
                      <div className="text-sm font-semibold text-zinc-200">News Impact Chime</div>
                      <div className="text-[11px] text-zinc-400">High volatility chirps</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={preferences.newsSounds}
                      onChange={(e) =>
                        handleSavePreferences(
                          { newsSounds: e.target.checked },
                          `News sounds ${e.target.checked ? "enabled" : "disabled"}`
                        )
                      }
                      className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 accent-amber-400 cursor-pointer"
                    />
                  </label>
                </div>
              </div>

              {/* Delivery Channels */}
              <div className="card-institutional p-5 sm:p-6 flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
                  <div>
                    <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                      <Send size={16} className="text-amber-400" />
                      Alert Delivery Channels
                    </h2>
                    <p className="text-xs text-zinc-400">Configure external messaging endpoints &amp; desktop push</p>
                  </div>
                  <Link
                    to="/alerts"
                    className="text-xs text-amber-400 hover:text-amber-300 font-mono underline flex items-center gap-1"
                  >
                    View Alert Center →
                  </Link>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  <label className="flex items-start justify-between gap-3 p-3.5 rounded-lg bg-zinc-950/60 border border-zinc-800 cursor-pointer hover:border-amber-500/30 transition-all">
                    <div>
                      <div className="text-sm font-semibold text-zinc-200">Desktop Push Notifications</div>
                      <div className="text-xs text-zinc-400 mt-0.5">
                        Display immediate operating system banners for critical Gann shifts.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={preferences.desktopPush}
                      onChange={(e) => {
                        const on = e.target.checked;
                        if (on && typeof window !== "undefined" && "Notification" in window) {
                          void Notification.requestPermission();
                        }
                        handleSavePreferences(
                          { desktopPush: on },
                          `Desktop notifications ${on ? "enabled" : "disabled"}`
                        );
                      }}
                      className="mt-1 h-4 w-4 rounded border-zinc-700 bg-zinc-900 accent-amber-400 cursor-pointer"
                    />
                  </label>

                  <label className="flex items-start justify-between gap-3 p-3.5 rounded-lg bg-zinc-950/60 border border-zinc-800 cursor-pointer hover:border-amber-500/30 transition-all">
                    <div>
                      <div className="text-sm font-semibold text-zinc-200">Telegram Bot Broadcasts</div>
                      <div className="text-xs text-zinc-400 mt-0.5">
                        Transmit high-conviction intraday signals to shared Telegram channel.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={preferences.telegramBroadcast}
                      onChange={(e) =>
                        handleSavePreferences(
                          { telegramBroadcast: e.target.checked },
                          `Telegram delivery ${e.target.checked ? "enabled" : "disabled"}`
                        )
                      }
                      className="mt-1 h-4 w-4 rounded border-zinc-700 bg-zinc-900 accent-amber-400 cursor-pointer"
                    />
                  </label>
                </div>

                {/* Minimum Priority Filter */}
                <div className="flex flex-col gap-2 p-3.5 rounded-lg bg-zinc-950/60 border border-zinc-800 mt-1">
                  <label className="text-xs font-mono font-medium text-zinc-300">
                    Minimum Alert Priority Threshold
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-1">
                    {[
                      { id: "ALL", label: "All Alerts", desc: "Info, Low, Medium, High, Critical" },
                      { id: "MEDIUM_PLUS", label: "Medium & Above", desc: "Recommended institutional setups" },
                      { id: "HIGH_ONLY", label: "High & Critical Only", desc: "Major breakouts & macro regimes" },
                    ].map((p) => {
                      const isSelected = preferences.minAlertPriority === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() =>
                            handleSavePreferences(
                              { minAlertPriority: p.id as UserPreferences["minAlertPriority"] },
                              `Minimum alert priority set to ${p.label}`
                            )
                          }
                          className={`text-left p-3 rounded-lg border text-xs transition-all ${
                            isSelected
                              ? "bg-amber-500/15 border-amber-400/60 text-amber-200 font-medium"
                              : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                          }`}
                        >
                          <div className="font-bold">{p.label}</div>
                          <div className="text-[11px] text-zinc-400 mt-0.5">{p.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: TRADING & ANALYTICS */}
          {activeTab === "trading" && (
            <div className="flex flex-col gap-6">
              {/* Default Underlying & Timeframe */}
              <div className="card-institutional p-5 sm:p-6 flex flex-col gap-5">
                <div className="border-b border-zinc-800/80 pb-3">
                  <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                    <Compass size={16} className="text-amber-400" />
                    Market Instruments &amp; Default Timeframes
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Workstation startup defaults for charts and mathematical engines
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Default Index */}
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-mono font-medium text-zinc-300">
                      Default Underlying Index
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(["NIFTY 50", "BANK NIFTY", "BSE SENSEX"] as const).map((idx) => {
                        const isSelected = preferences.defaultIndex === idx;
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() =>
                              handleSavePreferences(
                                { defaultIndex: idx },
                                `Default index set to ${idx}`
                              )
                            }
                            className={`p-3 rounded-lg border text-center text-xs font-bold transition-all ${
                              isSelected
                                ? "bg-amber-500/15 border-amber-400 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.2)]"
                                : "bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
                            }`}
                          >
                            {idx}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Default Timeframe */}
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-mono font-medium text-zinc-300">
                      Default Candle Timeframe
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {(["1m", "3m", "5m", "15m"] as const).map((tf) => {
                        const isSelected = preferences.defaultTimeframe === tf;
                        return (
                          <button
                            key={tf}
                            type="button"
                            onClick={() =>
                              handleSavePreferences(
                                { defaultTimeframe: tf },
                                `Default timeframe set to ${tf}`
                              )
                            }
                            className={`p-3 rounded-lg border text-center text-xs font-bold font-mono transition-all ${
                              isSelected
                                ? "bg-amber-500/15 border-amber-400 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.2)]"
                                : "bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
                            }`}
                          >
                            {tf}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Gann Angle Harmonics */}
                <div className="flex flex-col gap-2 pt-2 border-t border-zinc-800/80">
                  <label className="text-xs font-mono font-medium text-zinc-300">
                    Gann Square of 9 Harmonics Overlay
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      {
                        deg: "90",
                        title: "90° Cardinal Angles",
                        desc: "Quarters (90°, 180°, 270°, 360°) for fast intraday pivots",
                      },
                      {
                        deg: "180",
                        title: "180° Opposition",
                        desc: "Polarity reversal matrix for swing trend inflection",
                      },
                      {
                        deg: "360",
                        title: "360° Full Wheel Cycle",
                        desc: "Comprehensive 8-point astrological harmonic grid",
                      },
                    ].map((g) => {
                      const isSelected = preferences.gannAngleOverlay === g.deg;
                      return (
                        <button
                          key={g.deg}
                          type="button"
                          onClick={() =>
                            handleSavePreferences(
                              { gannAngleOverlay: g.deg as UserPreferences["gannAngleOverlay"] },
                              `Gann overlay set to ${g.title}`
                            )
                          }
                          className={`text-left p-3.5 rounded-lg border text-xs transition-all ${
                            isSelected
                              ? "bg-amber-500/15 border-amber-400/60 text-amber-200 font-medium shadow-[0_0_12px_rgba(245,158,11,0.15)]"
                              : "bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
                          }`}
                        >
                          <div className="font-bold text-sm text-zinc-100">{g.title}</div>
                          <div className="text-[11px] text-zinc-400 mt-1">{g.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: SECURITY & SESSIONS */}
          {activeTab === "security" && (
            <div className="flex flex-col gap-6">
              {/* Password Management */}
              <div className="card-institutional p-5 sm:p-6 flex flex-col gap-4">
                <div className="border-b border-zinc-800/80 pb-3">
                  <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                    <KeyRound size={16} className="text-amber-400" />
                    Update Password
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Change your master authentication secret. Minimum 8 characters required.
                  </p>
                </div>

                <form onSubmit={handleUpdatePassword} className="flex flex-col gap-4 max-w-xl">
                  {/* New Password */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-mono font-medium text-zinc-300">New Password</label>
                    <div className="relative">
                      <input
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="••••••••••••"
                        className="w-full rounded-lg border border-zinc-800 bg-zinc-950/70 px-3.5 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400/50 transition-all pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword((s) => !s)}
                        className="absolute right-3 top-2.5 text-zinc-400 hover:text-zinc-200"
                      >
                        {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Password Strength Meter */}
                  {newPassword && (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-zinc-400">Security Strength:</span>
                        <span className="font-bold text-amber-300">{passwordStrength.label}</span>
                      </div>
                      <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${passwordStrength.color} transition-all duration-300`}
                          style={{ width: `${(passwordStrength.score / 5) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Confirm Password */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-mono font-medium text-zinc-300">Confirm New Password</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full rounded-lg border border-zinc-800 bg-zinc-950/70 px-3.5 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400/50 transition-all"
                    />
                  </div>

                  <div className="flex justify-start pt-2">
                    <button
                      type="submit"
                      disabled={updatingPassword || !newPassword}
                      className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-bold px-5 py-2 text-sm transition-all shadow-[0_0_12px_rgba(245,158,11,0.2)] disabled:opacity-50 cursor-pointer"
                    >
                      {updatingPassword ? (
                        <>
                          <RefreshCw size={14} className="animate-spin" />
                          <span>Updating Password…</span>
                        </>
                      ) : (
                        <>
                          <Check size={14} />
                          <span>Update Password</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>

              {/* Active Sessions */}
              <div className="card-institutional p-5 sm:p-6 flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
                  <div>
                    <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                      <Laptop size={16} className="text-amber-400" />
                      Active Devices &amp; Multi-Session Access
                    </h2>
                    <p className="text-xs text-zinc-400">Manage and terminate sessions signed in to your account</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSignOutOtherDevices}
                    disabled={signingOutOthers}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <span>Sign Out from Other Devices</span>
                  </button>
                </div>

                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center justify-between p-3.5 rounded-lg bg-zinc-950/60 border border-zinc-800/80">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-300">
                        <Laptop size={18} />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-zinc-200 flex items-center gap-2">
                          <span>Web Browser (Current Session)</span>
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        </div>
                        <div className="text-xs font-mono text-zinc-400 mt-0.5">
                          Chrome on Windows · IP: Current · Active Now
                        </div>
                      </div>
                    </div>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                      CURRENT
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-3.5 rounded-lg bg-zinc-950/60 border border-zinc-800/80">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-300">
                        <Smartphone size={18} />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-zinc-200">Mobile Terminal / PWA</div>
                        <div className="text-xs font-mono text-zinc-400 mt-0.5">
                          iOS / Android · Last active today
                        </div>
                      </div>
                    </div>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                      STANDBY
                    </span>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => signOut()}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-zinc-700/80 bg-zinc-900/60 text-xs font-medium text-zinc-300 hover:text-rose-300 hover:border-rose-500/40 transition-all cursor-pointer"
                  >
                    <span>Log Out of Current Session</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
