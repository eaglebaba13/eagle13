// Phase 24D · Local dashboard preference storage.
//
// Client-only, versioned localStorage. Corrupted or version-mismatched
// payloads fall back to defaults instead of throwing. Required widgets
// cannot be hidden — attempts are ignored.

export const DASHBOARD_PREFERENCE_VERSION = 1;
export const DASHBOARD_PREFERENCE_KEY_PREFIX = "eb-dashboard-prefs";

export type DashboardPreferences = {
  version: number;
  collapsed: string[];
  hidden: string[];
  desktopOrder: string[];
  mobileOrder: string[];
};

export const REQUIRED_WIDGET_IDS: readonly string[] = [
  "legacy-quote",
  "legacy-gold-silver",
  "legacy-gann",
];

export const DEFAULT_PREFERENCES: DashboardPreferences = {
  version: DASHBOARD_PREFERENCE_VERSION,
  collapsed: [],
  hidden: [],
  desktopOrder: [],
  mobileOrder: [],
};

function storageKey(userId?: string | null): string {
  return userId
    ? `${DASHBOARD_PREFERENCE_KEY_PREFIX}:${userId}`
    : DASHBOARD_PREFERENCE_KEY_PREFIX;
}

function isStrArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

export function parsePreferences(raw: unknown): DashboardPreferences {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PREFERENCES };
  const o = raw as Record<string, unknown>;
  if (o.version !== DASHBOARD_PREFERENCE_VERSION) {
    return { ...DEFAULT_PREFERENCES };
  }
  return {
    version: DASHBOARD_PREFERENCE_VERSION,
    collapsed: isStrArray(o.collapsed) ? o.collapsed : [],
    hidden: isStrArray(o.hidden) ? o.hidden.filter((id) => !REQUIRED_WIDGET_IDS.includes(id)) : [],
    desktopOrder: isStrArray(o.desktopOrder) ? o.desktopOrder : [],
    mobileOrder: isStrArray(o.mobileOrder) ? o.mobileOrder : [],
  };
}

export function loadPreferences(
  storage: Storage | null | undefined,
  userId?: string | null,
): DashboardPreferences {
  if (!storage) return { ...DEFAULT_PREFERENCES };
  try {
    const raw = storage.getItem(storageKey(userId));
    if (!raw) return { ...DEFAULT_PREFERENCES };
    return parsePreferences(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePreferences(
  storage: Storage | null | undefined,
  prefs: DashboardPreferences,
  userId?: string | null,
): void {
  if (!storage) return;
  try {
    storage.setItem(storageKey(userId), JSON.stringify(prefs));
  } catch {
    /* ignore quota errors */
  }
}

function withoutId(list: string[], id: string): string[] {
  return list.filter((x) => x !== id);
}

function withId(list: string[], id: string): string[] {
  return list.includes(id) ? list : [...list, id];
}

export function toggleCollapsed(
  prefs: DashboardPreferences,
  id: string,
): DashboardPreferences {
  const collapsed = prefs.collapsed.includes(id)
    ? withoutId(prefs.collapsed, id)
    : withId(prefs.collapsed, id);
  return { ...prefs, collapsed };
}

export function hideWidget(
  prefs: DashboardPreferences,
  id: string,
): DashboardPreferences {
  if (REQUIRED_WIDGET_IDS.includes(id)) return prefs; // required cannot hide
  return { ...prefs, hidden: withId(prefs.hidden, id) };
}

export function showWidget(
  prefs: DashboardPreferences,
  id: string,
): DashboardPreferences {
  return { ...prefs, hidden: withoutId(prefs.hidden, id) };
}

function moveInList(list: string[], id: string, delta: -1 | 1): string[] {
  const idx = list.indexOf(id);
  if (idx < 0) return list;
  const target = idx + delta;
  if (target < 0 || target >= list.length) return list;
  const next = list.slice();
  const [x] = next.splice(idx, 1);
  next.splice(target, 0, x);
  return next;
}

export function moveWidget(
  prefs: DashboardPreferences,
  id: string,
  direction: "up" | "down",
  device: "desktop" | "mobile",
): DashboardPreferences {
  const delta = direction === "up" ? -1 : 1;
  if (device === "desktop") {
    return { ...prefs, desktopOrder: moveInList(prefs.desktopOrder, id, delta) };
  }
  return { ...prefs, mobileOrder: moveInList(prefs.mobileOrder, id, delta) };
}

export function resetDesktop(prefs: DashboardPreferences): DashboardPreferences {
  return { ...prefs, desktopOrder: [] };
}
export function resetMobile(prefs: DashboardPreferences): DashboardPreferences {
  return { ...prefs, mobileOrder: [] };
}
export function resetAll(): DashboardPreferences {
  return { ...DEFAULT_PREFERENCES };
}

export function isHidden(prefs: DashboardPreferences, id: string): boolean {
  if (REQUIRED_WIDGET_IDS.includes(id)) return false;
  return prefs.hidden.includes(id);
}

export function isCollapsed(prefs: DashboardPreferences, id: string): boolean {
  return prefs.collapsed.includes(id);
}