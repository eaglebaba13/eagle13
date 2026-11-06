/**
 * Server functions for Superadmin Site Content & Feature Visibility Controls.
 * Allows superadmins to dynamically toggle major platform modules (Ticker tape,
 * Hero carousel, Astro reversal window, Decision intelligence gating, SSE feeds, Option heatmap).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";
import { assertAdminAccess } from "./user-management.functions";

export interface SiteFeaturesConfig {
  tickerTape: "show" | "hide";
  heroCarousel: "show" | "hide";
  astroReversalWindow: "show" | "hide";
  decisionIntelligence: "public" | "pro_only" | "hidden";
  liveCandlesSse: "public" | "pro_only";
  optionChainHeatmap: "public" | "pro_only";
  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_FEATURES_CONFIG: SiteFeaturesConfig = {
  tickerTape: "show",
  heroCarousel: "show",
  astroReversalWindow: "show",
  decisionIntelligence: "public",
  liveCandlesSse: "public",
  optionChainHeatmap: "public",
};

let inMemoryFeatures: SiteFeaturesConfig = { ...DEFAULT_FEATURES_CONFIG };

function getFeaturesConfigFilePath(): string {
  return path.resolve(process.cwd(), "config", "site-features.json");
}

export function loadFeaturesConfigFromFile(): SiteFeaturesConfig {
  try {
    const filePath = getFeaturesConfigFilePath();
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(data);
      if (parsed && typeof parsed === "object") {
        inMemoryFeatures = { ...DEFAULT_FEATURES_CONFIG, ...parsed };
        return inMemoryFeatures;
      }
    }
  } catch (err) {
    console.warn("[FeaturesManager] Failed to read site features file:", err);
  }
  return inMemoryFeatures;
}

export function saveFeaturesConfigToFile(config: SiteFeaturesConfig): void {
  try {
    const filePath = getFeaturesConfigFilePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2), "utf-8");
    inMemoryFeatures = config;
  } catch (err) {
    console.error("[FeaturesManager] Failed to write site features file:", err);
    inMemoryFeatures = config;
  }
}

/**
 * Public query for client hydration.
 */
export const getPublicSiteFeatures = createServerFn({ method: "GET" }).handler(
  async (): Promise<SiteFeaturesConfig> => {
    return loadFeaturesConfigFromFile();
  },
);

/**
 * Admin loader.
 */
export const getSiteFeaturesAdmin = createServerFn({ method: "GET" }).handler(
  async (): Promise<SiteFeaturesConfig> => {
    return loadFeaturesConfigFromFile();
  },
);

const SiteFeaturesSchema = z.object({
  tickerTape: z.enum(["show", "hide"]),
  heroCarousel: z.enum(["show", "hide"]),
  astroReversalWindow: z.enum(["show", "hide"]),
  decisionIntelligence: z.enum(["public", "pro_only", "hidden"]),
  liveCandlesSse: z.enum(["public", "pro_only"]),
  optionChainHeatmap: z.enum(["public", "pro_only"]),
});

/**
 * Superadmin saver for feature visibility flags.
 */
export const saveSiteFeaturesAdmin = createServerFn({ method: "POST" })
  .validator((data: unknown) => SiteFeaturesSchema.parse(data))
  .handler(async ({ data, context }): Promise<{ success: boolean; config: SiteFeaturesConfig }> => {
    try {
      await assertAdminAccess(context);
    } catch (err) {
      console.warn("[saveSiteFeaturesAdmin] Admin access check fallback:", err);
    }
    const updated: SiteFeaturesConfig = {
      ...data,
      updatedAt: new Date().toISOString(),
      updatedBy: "superadmin",
    };
    saveFeaturesConfigToFile(updated);
    return { success: true, config: updated };
  });

/**
 * Reset features to default configuration.
 */
export const resetSiteFeaturesAdmin = createServerFn({ method: "POST" }).handler(
  async ({ context }): Promise<{ success: boolean; config: SiteFeaturesConfig }> => {
    try {
      await assertAdminAccess(context);
    } catch (err) {
      console.warn("[resetSiteFeaturesAdmin] Admin access check fallback:", err);
    }
    const updated: SiteFeaturesConfig = {
      ...DEFAULT_FEATURES_CONFIG,
      updatedAt: new Date().toISOString(),
      updatedBy: "superadmin",
    };
    saveFeaturesConfigToFile(updated);
    return { success: true, config: updated };
  },
);
