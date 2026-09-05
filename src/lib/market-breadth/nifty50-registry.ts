// Phase 27 · Stage 3 — Versioned NIFTY50 constituent weight registry.
//
// Weights are approximations to publicly available NIFTY50 free-float
// weights at REGISTRY_EFFECTIVE_DATE. Every consumer MUST expose the
// registry version so stale weights are never silently treated as
// current.

export const NIFTY50_REGISTRY_VERSION = "nifty50-registry@2025-01-30";
export const NIFTY50_REGISTRY_EFFECTIVE_DATE = "2025-01-30";
export const NIFTY50_REGISTRY_SOURCE = "public NSE indices monthly factsheet (approximate)";

export interface Nifty50Constituent {
  readonly symbol: string;
  readonly name: string;
  readonly weight: number; // 0..1
  readonly sector: string;
}

export const NIFTY50_CONSTITUENTS: readonly Nifty50Constituent[] = [
  { symbol: "HDFCBANK", name: "HDFC Bank", weight: 0.133, sector: "Banking" },
  { symbol: "RELIANCE", name: "Reliance Industries", weight: 0.091, sector: "Oil & Gas" },
  { symbol: "ICICIBANK", name: "ICICI Bank", weight: 0.083, sector: "Banking" },
  { symbol: "INFY", name: "Infosys", weight: 0.061, sector: "IT" },
  { symbol: "TCS", name: "Tata Consultancy", weight: 0.041, sector: "IT" },
  { symbol: "BHARTIARTL", name: "Bharti Airtel", weight: 0.04, sector: "Telecom" },
  { symbol: "LT", name: "Larsen & Toubro", weight: 0.038, sector: "Construction" },
  { symbol: "ITC", name: "ITC", weight: 0.036, sector: "FMCG" },
  { symbol: "AXISBANK", name: "Axis Bank", weight: 0.031, sector: "Banking" },
  { symbol: "KOTAKBANK", name: "Kotak Mahindra Bank", weight: 0.027, sector: "Banking" },
  { symbol: "SBIN", name: "State Bank of India", weight: 0.025, sector: "Banking" },
  { symbol: "M&M", name: "Mahindra & Mahindra", weight: 0.023, sector: "Auto" },
  { symbol: "BAJFINANCE", name: "Bajaj Finance", weight: 0.022, sector: "Finance" },
  { symbol: "HINDUNILVR", name: "Hindustan Unilever", weight: 0.021, sector: "FMCG" },
  { symbol: "MARUTI", name: "Maruti Suzuki", weight: 0.02, sector: "Auto" },
  { symbol: "SUNPHARMA", name: "Sun Pharma", weight: 0.019, sector: "Pharma" },
  { symbol: "HCLTECH", name: "HCL Technologies", weight: 0.018, sector: "IT" },
  { symbol: "NTPC", name: "NTPC", weight: 0.017, sector: "Power" },
  { symbol: "ULTRACEMCO", name: "UltraTech Cement", weight: 0.016, sector: "Cement" },
  { symbol: "TITAN", name: "Titan Company", weight: 0.015, sector: "Consumer" },
  { symbol: "TATAMOTORS", name: "Tata Motors", weight: 0.014, sector: "Auto" },
  { symbol: "POWERGRID", name: "Power Grid", weight: 0.0135, sector: "Power" },
  { symbol: "ADANIENT", name: "Adani Enterprises", weight: 0.013, sector: "Diversified" },
  { symbol: "ONGC", name: "ONGC", weight: 0.0125, sector: "Oil & Gas" },
  { symbol: "WIPRO", name: "Wipro", weight: 0.012, sector: "IT" },
  { symbol: "COALINDIA", name: "Coal India", weight: 0.0115, sector: "Metals" },
  { symbol: "BAJAJFINSV", name: "Bajaj Finserv", weight: 0.011, sector: "Finance" },
  { symbol: "JSWSTEEL", name: "JSW Steel", weight: 0.0105, sector: "Metals" },
  { symbol: "TATASTEEL", name: "Tata Steel", weight: 0.01, sector: "Metals" },
  { symbol: "ADANIPORTS", name: "Adani Ports", weight: 0.0095, sector: "Infrastructure" },
  { symbol: "ASIANPAINT", name: "Asian Paints", weight: 0.009, sector: "Consumer" },
  { symbol: "NESTLEIND", name: "Nestle India", weight: 0.0085, sector: "FMCG" },
  { symbol: "GRASIM", name: "Grasim Industries", weight: 0.008, sector: "Cement" },
  { symbol: "TECHM", name: "Tech Mahindra", weight: 0.0075, sector: "IT" },
  { symbol: "HINDALCO", name: "Hindalco", weight: 0.0072, sector: "Metals" },
  { symbol: "DRREDDY", name: "Dr Reddy's", weight: 0.007, sector: "Pharma" },
  { symbol: "CIPLA", name: "Cipla", weight: 0.0068, sector: "Pharma" },
  { symbol: "SBILIFE", name: "SBI Life", weight: 0.0065, sector: "Insurance" },
  { symbol: "BAJAJ-AUTO", name: "Bajaj Auto", weight: 0.006, sector: "Auto" },
  { symbol: "HDFCLIFE", name: "HDFC Life", weight: 0.0058, sector: "Insurance" },
  { symbol: "INDUSINDBK", name: "IndusInd Bank", weight: 0.0055, sector: "Banking" },
  { symbol: "TATACONSUM", name: "Tata Consumer", weight: 0.0052, sector: "FMCG" },
  { symbol: "EICHERMOT", name: "Eicher Motors", weight: 0.005, sector: "Auto" },
  { symbol: "HEROMOTOCO", name: "Hero MotoCorp", weight: 0.0048, sector: "Auto" },
  { symbol: "APOLLOHOSP", name: "Apollo Hospitals", weight: 0.0045, sector: "Healthcare" },
  { symbol: "DIVISLAB", name: "Divi's Laboratories", weight: 0.0043, sector: "Pharma" },
  { symbol: "BRITANNIA", name: "Britannia", weight: 0.004, sector: "FMCG" },
  { symbol: "BPCL", name: "BPCL", weight: 0.0038, sector: "Oil & Gas" },
  { symbol: "SHRIRAMFIN", name: "Shriram Finance", weight: 0.0035, sector: "Finance" },
  { symbol: "LTIM", name: "LTIMindtree", weight: 0.0033, sector: "IT" },
];

export function nifty50Symbols(): readonly string[] {
  return NIFTY50_CONSTITUENTS.map((c) => c.symbol);
}

export function nifty50WeightMap(): ReadonlyMap<string, number> {
  return new Map(NIFTY50_CONSTITUENTS.map((c) => [c.symbol, c.weight]));
}

export function topWeightedBasket(size = 10): readonly Nifty50Constituent[] {
  const sorted = [...NIFTY50_CONSTITUENTS].sort((a, b) => b.weight - a.weight);
  return sorted.slice(0, Math.max(1, Math.min(size, sorted.length)));
}

export function totalRegisteredWeight(list: readonly { weight: number }[]): number {
  return list.reduce((acc, c) => acc + c.weight, 0);
}
