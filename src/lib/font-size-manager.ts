// EagleBABA Dynamic Typography & Accessibility Scale Engine
// Persists font scale across sessions and smoothly adjusts root rem typography

export const MIN_FONT_SCALE = 85;
export const MAX_FONT_SCALE = 125;
export const DEFAULT_FONT_SCALE = 100;
export const FONT_SCALE_STEP = 5;

const STORAGE_KEY = "eb-font-scale";
const EVENT_NAME = "eb-font-scale-changed";

export function clampFontScale(scale: number): number {
  if (!Number.isFinite(scale)) return DEFAULT_FONT_SCALE;
  return Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, Math.round(scale)));
}

export function getStoredFontScale(): number {
  if (typeof window === "undefined") return DEFAULT_FONT_SCALE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_FONT_SCALE;
    const parsed = parseInt(raw, 10);
    return clampFontScale(parsed);
  } catch {
    return DEFAULT_FONT_SCALE;
  }
}

export function applyFontScaleToDOM(scale: number): number {
  const validScale = clampFontScale(scale);
  if (typeof document !== "undefined") {
    document.documentElement.style.fontSize = `${validScale}%`;
    document.documentElement.style.setProperty("--eb-font-scale", (validScale / 100).toFixed(2));
  }
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(validScale));
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { scale: validScale } }));
    } catch {}
  }
  return validScale;
}

export function increaseFontScale(): number {
  const current = getStoredFontScale();
  return applyFontScaleToDOM(current + FONT_SCALE_STEP);
}

export function decreaseFontScale(): number {
  const current = getStoredFontScale();
  return applyFontScaleToDOM(current - FONT_SCALE_STEP);
}

export function resetFontScale(): number {
  return applyFontScaleToDOM(DEFAULT_FONT_SCALE);
}
