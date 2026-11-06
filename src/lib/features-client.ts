import {
  type SiteFeaturesConfig,
  DEFAULT_FEATURES_CONFIG,
} from "./admin/features-manager.functions";

const FEATURES_STORAGE_KEY = "eb_site_features";

export function getCachedFeatures(): SiteFeaturesConfig {
  if (typeof window === "undefined") return DEFAULT_FEATURES_CONFIG;
  try {
    const raw = localStorage.getItem(FEATURES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return { ...DEFAULT_FEATURES_CONFIG, ...parsed };
      }
    }
  } catch {}
  return DEFAULT_FEATURES_CONFIG;
}

export function setCachedFeatures(features: SiteFeaturesConfig): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(FEATURES_STORAGE_KEY, JSON.stringify(features));
  } catch {}
}
