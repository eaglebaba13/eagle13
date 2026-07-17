// Phase 2A — Provider label sanitization.
//
// Production UI must never surface raw provider brand names or endpoint
// URLs (Yahoo Finance, query1.finance.yahoo.com, www.nseindia.com, raw
// Upstox paths). Admin diagnostics keep the raw values; user surfaces
// use safe aliases from this module.

export type SafeProviderRole =
  | "MARKET_DATA"
  | "HISTORICAL"
  | "OPTIONS"
  | "COMMODITY"
  | "BREADTH"
  | "UNKNOWN";

export const SAFE_PROVIDER_LABELS: Readonly<Record<SafeProviderRole, string>> = {
  MARKET_DATA: "Market Data Provider",
  HISTORICAL: "Historical Provider",
  OPTIONS: "Options Provider",
  COMMODITY: "Commodity Provider",
  BREADTH: "Breadth Provider",
  UNKNOWN: "Data Provider",
};

const RAW_REFS: readonly RegExp[] = [
  /yahoo\s*finance/i,
  /query[0-9]*\.finance\.yahoo\.com/i,
  /\byahoo\b/i,
  /www\.nseindia\.com/i,
  /nseindia\.com/i,
  /api\.upstox\.com/i,
];

export function containsRawProviderRef(text: string | null | undefined): boolean {
  if (!text) return false;
  return RAW_REFS.some((r) => r.test(text));
}

// Map a raw provider string to a safe user-facing label. Never returns a
// raw brand/URL. Callers pick the role that matches the surface.
export function safeProviderLabel(
  rawOrRole: string | SafeProviderRole | null | undefined,
  fallbackRole: SafeProviderRole = "UNKNOWN",
): string {
  if (rawOrRole && (rawOrRole as SafeProviderRole) in SAFE_PROVIDER_LABELS) {
    return SAFE_PROVIDER_LABELS[rawOrRole as SafeProviderRole];
  }
  return SAFE_PROVIDER_LABELS[fallbackRole];
}

// Redact raw provider references inside free-form strings (diagnostics
// prose, error messages). Preserves surrounding text.
export function redactRawProviderRefs(text: string): string {
  let out = text;
  out = out.replace(/query[0-9]*\.finance\.yahoo\.com/gi, "commodity provider");
  out = out.replace(/yahoo\s*finance\s*\(comex\)/gi, SAFE_PROVIDER_LABELS.COMMODITY);
  out = out.replace(/yahoo\s*finance/gi, SAFE_PROVIDER_LABELS.COMMODITY);
  out = out.replace(/\byahoo\b/gi, "reference");
  out = out.replace(/www\.nseindia\.com/gi, "options provider");
  out = out.replace(/\bnseindia\.com\b/gi, "options provider");
  out = out.replace(/api\.upstox\.com/gi, "market data provider");
  return out;
}