import type { ThemeStudioConfig } from "./admin/theme-studio.functions";
import { DEFAULT_THEME_CONFIG } from "./admin/theme-studio.functions";

const THEME_STORAGE_KEY = "eb_theme_config";

export function hexToRgba(hex: string, alpha: number): string {
  if (hex.startsWith("rgba") || hex.startsWith("rgb")) {
    return hex;
  }
  let c = hex.replace("#", "");
  if (c.length === 3) {
    c = c.split("").map((x) => x + x).join("");
  }
  if (c.length !== 6) {
    return `rgba(24, 24, 27, ${alpha})`;
  }
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function applyThemeToDOM(config: ThemeStudioConfig): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--eb-base-bg", config.baseBackground);
  root.style.setProperty("--eb-accent-color", config.accentColor);
  root.style.setProperty("--eb-border-tint", config.borderTint);
  root.style.setProperty("--eb-border-hover", config.accentColor);
  root.style.setProperty("--eb-glow-color", config.glowColor);
  root.style.setProperty("--eb-active-pill", config.activePillColor);
  root.style.setProperty("--eb-text-accent", config.textAccentColor);
  root.style.setProperty(
    "--eb-card-surface",
    hexToRgba(config.cardSurface, config.cardTransparency),
  );

  // Sync background color of document body
  document.body.style.backgroundColor = config.baseBackground;
}

export function getCachedThemeConfig(): ThemeStudioConfig {
  if (typeof window === "undefined") return DEFAULT_THEME_CONFIG;
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && parsed.baseBackground) {
        return { ...DEFAULT_THEME_CONFIG, ...parsed };
      }
    }
  } catch {
    // Ignore storage errors
  }
  return DEFAULT_THEME_CONFIG;
}

export function setCachedThemeConfig(config: ThemeStudioConfig): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Ignore storage errors
  }
}
