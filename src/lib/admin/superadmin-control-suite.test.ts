import { describe, it, expect, beforeEach } from "vitest";
import {
  THEME_PRESETS,
  DEFAULT_THEME_CONFIG,
  loadThemeConfigFromFile,
  saveThemeConfigToFile,
} from "./theme-studio.functions";
import {
  loadNavigationOverridesFromFile,
  saveNavigationOverridesToFile,
  getMergedNavigationItems,
} from "./navigation-manager.functions";
import {
  DEFAULT_FEATURES_CONFIG,
  loadFeaturesConfigFromFile,
  saveFeaturesConfigToFile,
} from "./features-manager.functions";
import {
  loadTelegramChannelsFromFile,
  saveTelegramChannelsToFile,
  type TelegramChannelConfig,
} from "./telegram-manager.functions";
import { hexToRgba } from "../theme-manager";

describe("Superadmin Control Suite - Unit Tests", () => {
  describe("Theme Studio & CSS Helper", () => {
    it("converts hex colors to rgba correctly", () => {
      expect(hexToRgba("#18181b", 0.5)).toBe("rgba(24, 24, 27, 0.5)");
      expect(hexToRgba("#000", 0.8)).toBe("rgba(0, 0, 0, 0.8)");
      expect(hexToRgba("rgba(24, 24, 27, 0.4)", 0.5)).toBe("rgba(24, 24, 27, 0.4)");
    });

    it("has valid preset structures for all 5 presets", () => {
      const presets = ["obsidian-gold", "cyber-cyan", "emerald-matrix", "royal-violet", "pure-black"] as const;
      for (const p of presets) {
        const cfg = THEME_PRESETS[p];
        expect(cfg).toBeDefined();
        expect(cfg.baseBackground).toMatch(/^#[0-9a-fA-F]{6}$/);
        expect(cfg.cardTransparency).toBeGreaterThan(0);
        expect(cfg.preset).toBe(p);
      }
    });

    it("persists and reloads theme config", () => {
      const testConfig = { ...DEFAULT_THEME_CONFIG, accentColor: "#123456" };
      saveThemeConfigToFile(testConfig);
      const loaded = loadThemeConfigFromFile();
      expect(loaded.accentColor).toBe("#123456");
      // Restore default
      saveThemeConfigToFile(DEFAULT_THEME_CONFIG);
    });
  });

  describe("Navigation Manager", () => {
    it("merges custom overrides with NAV_REGISTRY without dropping core links", () => {
      saveNavigationOverridesToFile({
        dashboard: { id: "dashboard", label: "Executive Cockpit", badge: "HOT" },
      });
      const items = getMergedNavigationItems();
      const dashboard = items.find((i) => i.id === "dashboard");
      expect(dashboard).toBeDefined();
      expect(dashboard?.label).toBe("Executive Cockpit");
      expect(dashboard?.badge).toBe("HOT");

      // Reset
      saveNavigationOverridesToFile({});
    });
  });

  describe("Site Feature Visibility Manager", () => {
    it("persists feature visibility toggles correctly", () => {
      const updated = {
        ...DEFAULT_FEATURES_CONFIG,
        tickerTape: "hide" as const,
        heroCarousel: "hide" as const,
        decisionIntelligence: "pro_only" as const,
      };
      saveFeaturesConfigToFile(updated);
      const loaded = loadFeaturesConfigFromFile();
      expect(loaded.tickerTape).toBe("hide");
      expect(loaded.heroCarousel).toBe("hide");
      expect(loaded.decisionIntelligence).toBe("pro_only");

      // Reset
      saveFeaturesConfigToFile(DEFAULT_FEATURES_CONFIG);
    });
  });

  describe("Dynamic Telegram Channels Manager", () => {
    it("loads and saves multiple channel configs", () => {
      const testChannels: TelegramChannelConfig[] = [
        {
          id: "ch-test-1",
          title: "VIP Crypto & Index Alerts",
          chatId: "-10099887766",
          alertFilter: "gann",
          status: "active",
          createdAt: new Date().toISOString(),
        },
        {
          id: "ch-test-2",
          title: "Astro Harmonics Broadcast",
          chatId: "-10011223344",
          alertFilter: "astro",
          status: "paused",
          createdAt: new Date().toISOString(),
        },
      ];

      saveTelegramChannelsToFile(testChannels);
      const loaded = loadTelegramChannelsFromFile();
      expect(loaded.length).toBe(2);
      expect(loaded[0].title).toBe("VIP Crypto & Index Alerts");
      expect(loaded[1].status).toBe("paused");
    });
  });
});
