// Admin-scoped per-widget on/off overrides.
//
// Stored client-side in localStorage under a single key. When a widget id
// is listed as disabled, the shared DashboardGrid filters it out for
// every viewer of that browser. This is a presentation-only override —
// no formulas, APIs, or decision logic are affected.

const STORAGE_KEY = "eb.admin.widgets.disabled.v1";

type Listener = (disabled: ReadonlySet<string>) => void;
const listeners = new Set<Listener>();

function readRaw(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeRaw(ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* ignore quota errors */
  }
}

export function getDisabledWidgetIds(): ReadonlySet<string> {
  return new Set(readRaw());
}

export function isWidgetDisabled(id: string): boolean {
  return readRaw().includes(id);
}

export function setWidgetDisabled(id: string, disabled: boolean): void {
  const cur = new Set(readRaw());
  if (disabled) cur.add(id);
  else cur.delete(id);
  const next = [...cur].sort();
  writeRaw(next);
  const snapshot = new Set(next);
  listeners.forEach((fn) => fn(snapshot));
}

export function resetWidgetToggles(): void {
  writeRaw([]);
  listeners.forEach((fn) => fn(new Set()));
}

export function subscribeWidgetToggles(fn: Listener): () => void {
  listeners.add(fn);
  if (typeof window !== "undefined") {
    const storageHandler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) fn(new Set(readRaw()));
    };
    window.addEventListener("storage", storageHandler);
    return () => {
      listeners.delete(fn);
      window.removeEventListener("storage", storageHandler);
    };
  }
  return () => listeners.delete(fn);
}