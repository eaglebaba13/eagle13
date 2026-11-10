/**
 * Official NSE & BSE F&O Lot Sizes — Central Single Source of Truth
 * Updated to post-2024 SEBI/NSE revision framework:
 * - NIFTY: 25 (previously 50 / 75)
 * - BANKNIFTY: 15 (previously 30)
 * - FINNIFTY: 25 (previously 65)
 * - MIDCPNIFTY: 50 (previously 120)
 * - SENSEX: 10
 * - BANKEX: 15
 * - Single-stock equities calibrated to official contract sizes
 */

export const OFFICIAL_NSE_LOT_SIZES: Readonly<Record<string, number>> = {
  // Major Indices & Aliases
  NIFTY: 25,
  NIFTY50: 25,
  "NIFTY 50": 25,
  BANKNIFTY: 15,
  "BANK NIFTY": 15,
  FINNIFTY: 25,
  "NIFTY FIN SERVICE": 25,
  MIDCPNIFTY: 50,
  "NIFTY MID SELECT": 50,
  SENSEX: 10,
  BANKEX: 15,

  // ETFs
  NIFTYBEES: 100,
  BANKBEES: 100,
  GOLDBEES: 100,
  SILVERBEES: 100,

  // Major F&O Equities (Official NSE Specifications)
  RELIANCE: 500,
  HDFCBANK: 550,
  ICICIBANK: 700,
  SBIN: 750,
  AXISBANK: 625,
  KOTAKBANK: 400,
  AUBANK: 500,
  BANDHANBNK: 2500,
  BANKBARODA: 2925,
  PNB: 8000,
  CANBK: 6750,
  IDFCFIRSTB: 7500,
  FEDERALBNK: 5000,
  INDUSINDBK: 500,
  TCS: 175,
  INFY: 400,
  HCLTECH: 350,
  WIPRO: 1500,
  TECHM: 600,
  LTIM: 150,
  PERSISTENT: 100,
  COFORGE: 150,
  MARUTI: 50,
  TATAMOTORS: 550,
  "M&M": 350,
  "BAJAJ-AUTO": 75,
  HEROMOTOCO: 150,
  EICHERMOT: 150,
  TVSMOTOR: 350,
  BHARATFORG: 500,
  ASHOKLEY: 5000,
  BHARTIARTL: 475,
  ITC: 1600,
  HINDUNILVR: 300,
  LT: 150,
  BAJFINANCE: 125,
  BAJAJFINSV: 500,
  CHOLAFIN: 625,
  SHRIRAMFIN: 300,
  MUTHOOTFIN: 550,
  RECLTD: 1400,
  PFC: 1300,
  ONGC: 3850,
  NTPC: 1500,
  POWERGRID: 1800,
  BPCL: 1800,
  IOC: 4875,
  COALINDIA: 2100,
  TATAPOWER: 1350,
  TATASTEEL: 5500,
  JSWSTEEL: 675,
  HINDALCO: 1400,
  VEDL: 2300,
  JINDALSTEL: 625,
  NMDC: 4500,
  SAIL: 8000,
  SUNPHARMA: 350,
  CIPLA: 650,
  DRREDDY: 125,
  DIVISLAB: 200,
  APOLLOHOSP: 125,
  TITAN: 175,
  ULTRACEMCO: 50,
  GRASIM: 475,
  AMBUJACEM: 1800,
  DLF: 825,
  BEL: 2850,
  HAL: 300,
  TRENT: 100,
  ZOMATO: 2000,
  NYKAA: 1875,
  PAYTM: 650,
};

/**
 * Normalizes symbol identifier and retrieves the official NSE lot size.
 * Handles symbol aliases, prefixes (e.g. NSE_INDEX|Nifty 50, NSE_EQ|INE...),
 * and computes calibrated standard notional lot sizing for unlisted equities.
 */
export function getOfficialLotSize(symbol: string, defaultPrice: number = 1000): number {
  if (!symbol) return 25;

  // Clean and normalize input symbol
  let clean = symbol.trim().toUpperCase();
  if (clean.includes("|")) {
    clean = clean.split("|")[1]?.trim() ?? clean;
  }
  clean = clean.replace(/^NSE_INDEX:/, "").replace(/^NSE_EQ:/, "").replace(/^NSE:/, "");

  // Direct lookup
  if (OFFICIAL_NSE_LOT_SIZES[clean] !== undefined) {
    return OFFICIAL_NSE_LOT_SIZES[clean];
  }

  // Common aliases
  if (clean.includes("NIFTY 50") || clean === "NIFTY50" || clean === "NIFTY_50") return 25;
  if (clean.includes("BANKNIFTY") || clean.includes("BANK NIFTY")) return 15;
  if (clean.includes("FINNIFTY") || clean.includes("FIN NIFTY")) return 25;
  if (clean.includes("MIDCPNIFTY") || clean.includes("MIDCAP")) return 50;
  if (clean.includes("SENSEX")) return 10;
  if (clean.includes("BANKEX")) return 15;

  // Standard NSE derivative lot size targeting approx ₹5-7 Lakhs contract notional
  const targetLot = Math.round(600000 / Math.max(10, defaultPrice || 1000) / 25) * 25;
  return Math.max(25, targetLot);
}
