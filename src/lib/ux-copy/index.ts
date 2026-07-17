// Phase 34 · Production-facing copy helpers.
// Never surface raw technical statuses to paying users. Route every
// widget/card state through `humaniseStatus` so wording is consistent.

export type UxState =
  | "IDLE"
  | "LOADING"
  | "REFRESHING"
  | "READY"
  | "PARTIAL"
  | "WAITING_PROVIDER"
  | "PROVIDER_DEGRADED"
  | "PROVIDER_UNAVAILABLE"
  | "AUTH_REQUIRED"
  | "COMING_SOON"
  | "HIDDEN";

export interface HumanisedStatus {
  readonly state: UxState;
  readonly label: string;
  readonly detail: string;
  readonly tone: "neutral" | "info" | "warning" | "danger" | "success";
  readonly showSkeleton: boolean;
  readonly retryable: boolean;
}

export function humaniseStatus(state: UxState, providerName?: string): HumanisedStatus {
  const p = providerName ?? "provider";
  switch (state) {
    case "IDLE":
      return { state, label: "Waiting…", detail: "Preparing data.", tone: "neutral", showSkeleton: false, retryable: false };
    case "LOADING":
      return { state, label: "Loading", detail: "Fetching live data.", tone: "info", showSkeleton: true, retryable: false };
    case "REFRESHING":
      return { state, label: "Refreshing", detail: "Updating in the background.", tone: "info", showSkeleton: false, retryable: false };
    case "READY":
      return { state, label: "Live", detail: "Data is current.", tone: "success", showSkeleton: false, retryable: false };
    case "PARTIAL":
      return { state, label: "Provider partial", detail: `${p} returned partial data. Some fields may be blank.`, tone: "warning", showSkeleton: false, retryable: true };
    case "WAITING_PROVIDER":
      return { state, label: "Waiting for provider", detail: `Waiting for ${p} to publish data.`, tone: "info", showSkeleton: true, retryable: false };
    case "PROVIDER_DEGRADED":
      return { state, label: "Provider degraded", detail: `${p} is responding slowly. Retrying automatically.`, tone: "warning", showSkeleton: false, retryable: true };
    case "PROVIDER_UNAVAILABLE":
      return { state, label: "Provider temporarily unavailable", detail: `${p} is offline. We'll retry shortly.`, tone: "danger", showSkeleton: false, retryable: true };
    case "AUTH_REQUIRED":
      return { state, label: "Sign in to continue", detail: "This widget needs an authenticated session.", tone: "info", showSkeleton: false, retryable: false };
    case "COMING_SOON":
      return { state, label: "Coming soon", detail: "This module is planned for a future release.", tone: "neutral", showSkeleton: false, retryable: false };
    case "HIDDEN":
      return { state, label: "", detail: "", tone: "neutral", showSkeleton: false, retryable: false };
  }
}

// Replace legacy noise strings ("Missing", "Unavailable", "Not Available")
// with a friendly production-facing label. Preserve unknown/empty inputs
// as-is so this never masks a real diagnostic value.
export function humaniseLegacyLabel(raw: string | null | undefined, providerName?: string): string {
  if (!raw) return "";
  const normalised = raw.trim().toLowerCase();
  if (normalised === "missing") return humaniseStatus("WAITING_PROVIDER", providerName).label;
  if (normalised === "unavailable" || normalised === "not available") {
    return humaniseStatus("PROVIDER_UNAVAILABLE", providerName).label;
  }
  if (normalised === "no data") return humaniseStatus("WAITING_PROVIDER", providerName).label;
  if (normalised === "loading" || normalised === "loading…") return humaniseStatus("LOADING").label;
  return raw;
}

// Aggregate multiple provider states into a single top-level status
// suitable for the compact provider health bar.
export type ProviderHealthLight = "GREEN" | "YELLOW" | "RED";

export function rollupHealth(states: readonly UxState[]): ProviderHealthLight {
  if (states.some((s) => s === "PROVIDER_UNAVAILABLE")) return "RED";
  if (states.some((s) => s === "PROVIDER_DEGRADED" || s === "PARTIAL" || s === "WAITING_PROVIDER")) return "YELLOW";
  return "GREEN";
}