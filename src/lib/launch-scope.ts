// Phase 26 · Stage 4 — Launch-market registry.
//
// Single source of truth for which markets are ACTIVE in the first
// subscription-ready release, which are RESEARCH · COMING NEXT, and which
// remain HIDDEN until their provider is verified. Pure metadata — no
// imports of engines, providers, or UI. Client- and server-safe.

export type LaunchMarketSymbol =
  | "NIFTY50"
  | "BANKNIFTY"
  | "INDIA_VIX"
  | "COMBINED_PCR"
  | "GOLD"
  | "SILVER"
  | "CRUDEOIL"
  | "NATURAL_GAS"
  | "XAUUSD"
  | "XAGUSD"
  | "BTC"
  | "ETH";

export type MarketVisibility = "ACTIVE" | "COMING_NEXT" | "HIDDEN";

export const ACTIVE_MARKETS = ["NIFTY50", "BANKNIFTY", "INDIA_VIX"] as const;
export const RESEARCH_COMING_NEXT = ["COMBINED_PCR"] as const;
export const HIDDEN_UNTIL_PROVIDER_READY = [
  "GOLD",
  "SILVER",
  "CRUDEOIL",
  "NATURAL_GAS",
  "XAUUSD",
  "XAGUSD",
  "BTC",
  "ETH",
] as const;

export const LAUNCH_MARKETS = {
  active: ACTIVE_MARKETS,
  researchComingNext: RESEARCH_COMING_NEXT,
  hidden: HIDDEN_UNTIL_PROVIDER_READY,
} as const;

export function isActiveMarket(sym: string): boolean {
  return (ACTIVE_MARKETS as readonly string[]).includes(sym);
}

export function isComingNextMarket(sym: string): boolean {
  return (RESEARCH_COMING_NEXT as readonly string[]).includes(sym);
}

export function isHiddenMarket(sym: string): boolean {
  return (HIDDEN_UNTIL_PROVIDER_READY as readonly string[]).includes(sym);
}

export function marketVisibility(sym: string): MarketVisibility {
  if (isActiveMarket(sym)) return "ACTIVE";
  if (isComingNextMarket(sym)) return "COMING_NEXT";
  return "HIDDEN";
}

/** Reason string used by admin diagnostics — never shown as an error. */
export function hiddenMarketReason(sym: string): string | null {
  if (!isHiddenMarket(sym)) return null;
  switch (sym) {
    case "GOLD":
    case "SILVER":
    case "CRUDEOIL":
    case "NATURAL_GAS":
      return "MCX contract resolution incomplete";
    case "XAUUSD":
    case "XAGUSD":
      return "Global metal provider not verified";
    case "BTC":
    case "ETH":
      return "Crypto provider not verified";
    default:
      return "Provider integration in progress";
  }
}