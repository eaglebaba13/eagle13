// Phase 44A — Disclaimer constants for the Multi-Asset Intelligence Brief.
// These strings must never be truncated by the Telegram splitter.

export const DISCLAIMER_GENERAL =
  "EagleBABA is a research and market analytics platform. Levels, ratios, " +
  "probabilities and signals are algorithmically generated for educational " +
  "and research purposes only. They do not constitute financial or " +
  "investment advice. Trading and investing involve risk, including " +
  "possible loss of capital. Verify all prices and levels with your broker " +
  "before taking any action.";

export const DISCLAIMER_CRYPTO =
  "Crypto assets trade 24x7, are highly volatile and may result in " +
  "substantial or total loss of capital.";

export const DISCLAIMER_DERIVATIVES =
  "Options and derivatives may result in loss of the entire premium or " +
  "greater losses depending on the product and position.";

export const ALL_DISCLAIMERS = [
  DISCLAIMER_GENERAL,
  DISCLAIMER_CRYPTO,
  DISCLAIMER_DERIVATIVES,
] as const;

export function composeDisclaimerBlock(): string {
  return ALL_DISCLAIMERS.join("\n\n");
}