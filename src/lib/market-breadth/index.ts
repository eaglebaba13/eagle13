// Phase 27 · Stage 3 — Market Breadth research surface (client-safe).

export * from "./types";
export * from "./breadth-calc";
export * from "./vix-regime";
export * from "./pcr-confirmation";
export * from "./conflict-detector";
export * from "./confidence";
export * from "./gti-classifier";
export * from "./data-quality";
export * from "./exports";
export * from "./mock-provider";
export * from "./persistent-history";
export * from "./shadow-validation";
export * from "./nifty50-registry";
export * from "./sector-registry";
export { registerMarketBreadthProvider, getMarketBreadthProvider, listMarketBreadthProviders } from "./provider";
