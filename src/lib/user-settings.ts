/**
 * User Settings & Preferences Controller.
 * Manages appearance, notification channels, trading defaults, and algorithmic preferences.
 * Persists locally to localStorage and provides seamless synchronization.
 */

import {
  type ThemePreset,
  THEME_PRESETS,
  type ThemeStudioConfig,
} from "./admin/theme-studio.functions";
import { applyThemeToDOM, setCachedThemeConfig, getCachedThemeConfig } from "./theme-manager";
import { getAudioNotificationManager } from "./audio-notifications";

export const USER_SETTINGS_STORAGE_KEY = "eb_user_settings_v1";

export interface UserPreferences {
  // Appearance
  themePreset: ThemePreset;
  compactMode: boolean;
  chartAnimations: boolean;
  numberFormat: "inr" | "intl";

  // Notifications
  soundAlerts: boolean;
  signalSounds: boolean;
  newsSounds: boolean;
  desktopPush: boolean;
  telegramBroadcast: boolean;
  minAlertPriority: "ALL" | "MEDIUM_PLUS" | "HIGH_ONLY";
  emailAlerts: boolean;
  brokerAlerts: boolean;

  // Trading & Analytics
  defaultIndex: "NIFTY 50" | "BANK NIFTY" | "BSE SENSEX";
  defaultTimeframe: "1m" | "3m" | "5m" | "15m";
  gannAngleOverlay: "90" | "180" | "360";
  refreshRate: "realtime" | "1s" | "5s";
}

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  themePreset: "obsidian-gold",
  compactMode: false,
  chartAnimations: true,
  numberFormat: "inr",

  soundAlerts: true,
  signalSounds: true,
  newsSounds: true,
  desktopPush: false,
  telegramBroadcast: true,
  minAlertPriority: "ALL",
  emailAlerts: false,
  brokerAlerts: true,

  defaultIndex: "NIFTY 50",
  defaultTimeframe: "5m",
  gannAngleOverlay: "360",
  refreshRate: "realtime",
};

/**
 * Load user settings from localStorage with safe fallback to defaults.
 */
export function loadUserSettings(): UserPreferences {
  if (typeof window === "undefined") {
    return { ...DEFAULT_USER_PREFERENCES };
  }

  try {
    const raw = localStorage.getItem(USER_SETTINGS_STORAGE_KEY);
    const cachedTheme = getCachedThemeConfig();
    const fallbackTheme = (cachedTheme?.preset as ThemePreset) || "obsidian-gold";

    if (!raw) {
      return {
        ...DEFAULT_USER_PREFERENCES,
        themePreset: fallbackTheme,
      };
    }

    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_USER_PREFERENCES,
      themePreset: fallbackTheme,
      ...parsed,
    };
  } catch (err) {
    console.warn("[UserSettings] Error loading settings, falling back to defaults:", err);
    return { ...DEFAULT_USER_PREFERENCES };
  }
}

/**
 * Save user settings to localStorage and apply side effects (DOM theme, audio config).
 */
export function saveUserSettings(prefs: Partial<UserPreferences>): UserPreferences {
  const current = loadUserSettings();
  const updated: UserPreferences = { ...current, ...prefs };

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(USER_SETTINGS_STORAGE_KEY, JSON.stringify(updated));

      // Side-effect: sync theme if updated
      if (
        prefs.themePreset &&
        prefs.themePreset !== "custom" &&
        THEME_PRESETS[prefs.themePreset]
      ) {
        const themeConfig: ThemeStudioConfig = THEME_PRESETS[prefs.themePreset];
        setCachedThemeConfig(themeConfig);
        applyThemeToDOM(themeConfig);
      }

      // Side-effect: sync audio manager if sound preferences updated
      if (
        prefs.soundAlerts !== undefined ||
        prefs.signalSounds !== undefined ||
        prefs.newsSounds !== undefined
      ) {
        const audioMgr = getAudioNotificationManager();
        audioMgr.setConfig({
          enabled: updated.soundAlerts,
          signalSounds: updated.signalSounds,
          newsSounds: updated.newsSounds,
        });
      }

      // Dispatch custom window event so other components react immediately
      window.dispatchEvent(
        new CustomEvent("eb:user-settings-updated", { detail: updated })
      );
    } catch (err) {
      console.warn("[UserSettings] Error saving settings:", err);
    }
  }

  return updated;
}

