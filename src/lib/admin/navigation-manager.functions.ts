/**
 * Server functions for Superadmin Navigation & Menu Bar Manager.
 * Allows superadmins to reorder, toggle desktop/mobile visibility, set role gates,
 * and assign badge text dynamically to navigation items.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";
import { assertAdminAccess } from "./user-management.functions";
import { NAV_REGISTRY, type NavItem } from "../navigation";

export interface NavigationOverride {
  id: string;
  label?: string;
  order?: number;
  desktopVisible?: boolean;
  mobileVisible?: boolean;
  minRole?: "guest" | "user" | "pro" | "admin" | "superadmin";
  badge?: string;
}

export interface MergedNavItem extends NavItem {
  minRole?: "guest" | "user" | "pro" | "admin" | "superadmin";
  badge?: string;
}

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

export function getMergedNavigationItems(): MergedNavItem[] {
  const overrides = loadNavigationOverridesFromFile();
  return NAV_REGISTRY.map((raw) => {
    const ov = overrides[raw.id];
    return {
      ...raw,
      label: ov?.label ?? raw.label,
      order: ov?.order ?? raw.order,
      desktopVisible: ov?.desktopVisible !== undefined ? ov.desktopVisible : raw.desktopVisible,
      mobileVisible: ov?.mobileVisible !== undefined ? ov.mobileVisible : raw.mobileVisible,
      minRole: ov?.minRole,
      badge: ov?.badge,
    };
  }).sort((a, b) => a.order - b.order);
}

/**
 * Public query for client sidebar hydration.
 */
export const getPublicNavigationConfig = createServerFn({ method: "GET" }).handler(
  async (): Promise<MergedNavItem[]> => {
    return getMergedNavigationItems();
  },
);

/**
 * Admin loader for navigation manager UI.
 */
export const getNavigationConfigAdmin = createServerFn({ method: "GET" }).handler(
  async (): Promise<MergedNavItem[]> => {
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
  .handler(async ({ data }): Promise<{ success: boolean; items: MergedNavItem[] }> => {
    await assertAdminAccess();
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
  async (): Promise<{ success: boolean; items: MergedNavItem[] }> => {
    await assertAdminAccess();
    saveNavigationOverridesToFile({});
    return { success: true, items: getMergedNavigationItems() };
  },
);
