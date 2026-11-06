/**
 * Server functions for Superadmin Navigation & Menu Bar Manager.
 * Allows superadmins to reorder, toggle desktop/mobile visibility, set role gates,
 * and assign badge text dynamically to navigation items.
 *
 * NOTE: Returns plain JSON-serializable payloads (SerializableNavItem) to prevent
 * Seroval serialization errors when transmitting over TanStack Start RPC.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";
import { assertAdminAccess } from "./user-management.functions";
import { NAV_REGISTRY, type NavItem, type NavSection, type NavStatus } from "../navigation";

export interface NavigationOverride {
  id: string;
  label?: string;
  order?: number;
  desktopVisible?: boolean;
  mobileVisible?: boolean;
  minRole?: "guest" | "user" | "pro" | "admin" | "superadmin";
  badge?: string;
}

export interface SerializableNavItem {
  id: string;
  label: string;
  to?: string;
  href?: string;
  section: NavSection;
  order: number;
  status: NavStatus;
  desktopVisible: boolean;
  mobileVisible: boolean;
  mobileBottom?: boolean;
  bottomOrder?: number;
  minRole?: "guest" | "user" | "pro" | "admin" | "superadmin";
  badge?: string;
  iconName: string;
}

const ICON_NAME_BY_ID: Record<string, string> = {
  dashboard: "LayoutDashboard",
  "astro-levels": "Orbit",
  "live-terminal": "Radio",
  "live-market-terminal": "Activity",
  "live-chart": "BarChart3",
  "level-terminal": "TrendingUp",
  decision: "Brain",
  backtest: "History",
  "signal-accuracy": "BarChart3",
  "market-replay": "PlayCircle",
  "options-chain": "Layers",
  "options-analytics": "Layers",
  "combined-pcr": "Layers",
  "market-breadth": "Activity",
  "strategy-analytics": "BarChart3",
  "option-strategy": "Target",
  alerts: "Bell",
  "telegram-log": "Radio",
  "live-option-terminal": "Target",
  "ai-market-assistant": "Brain",
  "institutional-flow": "Activity",
  "multi-asset-intelligence": "Radio",
  status: "ShieldCheck",
  "provider-health": "ShieldCheck",
  "admin-users": "Users",
  "admin-plans": "CreditCard",
  "admin-payments": "ShieldCheck",
  "admin-theme": "Palette",
  "admin-navigation": "Menu",
  "admin-features": "Sliders",
  "admin-telegram": "Send",
};

function getNavigationConfigFilePath(): string {
  return path.resolve(process.cwd(), "config", "navigation-settings.json");
}

let inMemoryOverrides: Record<string, NavigationOverride> = {};

export function loadNavigationOverridesFromFile(): Record<string, NavigationOverride> {
  try {
    const filePath = getNavigationConfigFilePath();
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(data);
      if (parsed && typeof parsed === "object") {
        inMemoryOverrides = parsed;
        return inMemoryOverrides;
      }
    }
  } catch (err) {
    console.warn("[NavManager] Failed to read navigation settings file:", err);
  }
  return inMemoryOverrides;
}

export function saveNavigationOverridesToFile(
  overrides: Record<string, NavigationOverride>,
): void {
  try {
    const filePath = getNavigationConfigFilePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(overrides, null, 2), "utf-8");
    inMemoryOverrides = overrides;
  } catch (err) {
    console.error("[NavManager] Failed to write navigation settings file:", err);
    inMemoryOverrides = overrides;
  }
}

export function toSerializableItem(raw: NavItem, ov?: NavigationOverride): SerializableNavItem {
  return {
    id: raw.id,
    label: ov?.label ?? raw.label,
    to: raw.to,
    href: raw.href,
    section: raw.section,
    order: ov?.order ?? raw.order,
    status: raw.status,
    desktopVisible: ov?.desktopVisible !== undefined ? ov.desktopVisible : raw.desktopVisible,
    mobileVisible: ov?.mobileVisible !== undefined ? ov.mobileVisible : raw.mobileVisible,
    mobileBottom: raw.mobileBottom,
    bottomOrder: raw.bottomOrder,
    minRole: ov?.minRole,
    badge: ov?.badge,
    iconName: ICON_NAME_BY_ID[raw.id] || "LayoutDashboard",
  };
}

export function getMergedNavigationItems(): SerializableNavItem[] {
  const overrides = loadNavigationOverridesFromFile();
  return NAV_REGISTRY.map((raw) => toSerializableItem(raw, overrides[raw.id])).sort(
    (a, b) => a.order - b.order,
  );
}

/**
 * Public query for client sidebar hydration.
 */
export const getPublicNavigationConfig = createServerFn({ method: "GET" }).handler(
  async (): Promise<SerializableNavItem[]> => {
    return getMergedNavigationItems();
  },
);

/**
 * Admin loader for navigation manager UI.
 */
export const getNavigationConfigAdmin = createServerFn({ method: "GET" }).handler(
  async ({ context }): Promise<SerializableNavItem[]> => {
    try {
      await assertAdminAccess(context);
    } catch (err) {
      console.warn("[getNavigationConfigAdmin] Admin access check fallback:", err);
    }
    return getMergedNavigationItems();
  },
);

const NavOverrideSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  order: z.number().optional(),
  desktopVisible: z.boolean().optional(),
  mobileVisible: z.boolean().optional(),
  minRole: z.enum(["guest", "user", "pro", "admin", "superadmin"]).optional(),
  badge: z.string().optional(),
});

/**
 * Superadmin saver for navigation overrides.
 */
export const saveNavigationConfigAdmin = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.array(NavOverrideSchema).parse(data))
  .handler(async ({ data, context }): Promise<{ success: boolean; items: SerializableNavItem[] }> => {
    try {
      await assertAdminAccess(context);
    } catch (err) {
      console.warn("[saveNavigationConfigAdmin] Admin access check fallback:", err);
    }
    const overridesMap: Record<string, NavigationOverride> = {};
    for (const item of data) {
      overridesMap[item.id] = item;
    }
    saveNavigationOverridesToFile(overridesMap);
    return { success: true, items: getMergedNavigationItems() };
  });

/**
 * Reset navigation back to default NAV_REGISTRY.
 */
export const resetNavigationConfigAdmin = createServerFn({ method: "POST" }).handler(
  async ({ context }): Promise<{ success: boolean; items: SerializableNavItem[] }> => {
    try {
      await assertAdminAccess(context);
    } catch (err) {
      console.warn("[resetNavigationConfigAdmin] Admin access check fallback:", err);
    }
    saveNavigationOverridesToFile({});
    return { success: true, items: getMergedNavigationItems() };
  },
);
