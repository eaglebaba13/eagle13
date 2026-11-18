/**
 * Universal F&O, Indices, Commodities & Crypto Universe
 * Client-safe, zero server-dependencies, single source of truth for Symbol Search & Live Chart.
 */

import { OFFICIAL_NSE_LOT_SIZES } from "./constants";

export type AssetClass = "INDEX" | "ETF" | "FO_EQUITY" | "COMMODITY" | "CRYPTO";
export type AssetCurrency = "INR" | "USD" | "USDT";

export interface UniversalInstrument {
  readonly key: string;
  readonly symbol: string;
  readonly name: string;
  readonly sector: string;
  readonly category: AssetClass;
  readonly currency: AssetCurrency;
  readonly defaultPrice: number;
  readonly lotSize: number;
  readonly tickSize: number;
}

export const UNIVERSAL_INSTRUMENTS: readonly UniversalInstrument[] = [
  // --- 1. Indices & ETFs ---
  { key: "NIFTY50", symbol: "NIFTY50", name: "NIFTY 50", sector: "Indices & ETFs", category: "INDEX", currency: "INR", defaultPrice: 25044.65, lotSize: 25, tickSize: 0.05 },
  { key: "BANKNIFTY", symbol: "BANKNIFTY", name: "BANK NIFTY", sector: "Indices & ETFs", category: "INDEX", currency: "INR", defaultPrice: 59741.25, lotSize: 15, tickSize: 0.05 },
  { key: "FINNIFTY", symbol: "FINNIFTY", name: "NIFTY FIN SERVICES", sector: "Indices & ETFs", category: "INDEX", currency: "INR", defaultPrice: 27384.9, lotSize: 25, tickSize: 0.05 },
  { key: "MIDCPNIFTY", symbol: "MIDCPNIFTY", name: "NIFTY MIDCAP SELECT", sector: "Indices & ETFs", category: "INDEX", currency: "INR", defaultPrice: 14055.45, lotSize: 50, tickSize: 0.05 },
  { key: "SENSEX", symbol: "SENSEX", name: "BSE SENSEX", sector: "Indices & ETFs", category: "INDEX", currency: "INR", defaultPrice: 81106.65, lotSize: 10, tickSize: 0.05 },
  { key: "BANKEX", symbol: "BANKEX", name: "BSE BANKEX", sector: "Indices & ETFs", category: "INDEX", currency: "INR", defaultPrice: 62450.00, lotSize: 15, tickSize: 0.05 },
  { key: "INDIA_VIX", symbol: "INDIA_VIX", name: "INDIA VIX", sector: "Indices & ETFs", category: "INDEX", currency: "INR", defaultPrice: 14.85, lotSize: 1, tickSize: 0.01 },
  { key: "NIFTY_IT", symbol: "NIFTY_IT", name: "NIFTY IT", sector: "Indices & ETFs", category: "INDEX", currency: "INR", defaultPrice: 43850.00, lotSize: 1, tickSize: 0.05 },
  { key: "NIFTYBEES", symbol: "NIFTYBEES", name: "Nippon India Nifty 50 ETF", sector: "Indices & ETFs", category: "ETF", currency: "INR", defaultPrice: 285.01, lotSize: 100, tickSize: 0.01 },
  { key: "BANKBEES", symbol: "BANKBEES", name: "Nippon India Bank ETF", sector: "Indices & ETFs", category: "ETF", currency: "INR", defaultPrice: 616.82, lotSize: 100, tickSize: 0.01 },
  { key: "GOLDBEES", symbol: "GOLDBEES", name: "Nippon India Gold ETF", sector: "Indices & ETFs", category: "ETF", currency: "INR", defaultPrice: 116.86, lotSize: 100, tickSize: 0.01 },
  { key: "SILVERBEES", symbol: "SILVERBEES", name: "Nippon India Silver ETF", sector: "Indices & ETFs", category: "ETF", currency: "INR", defaultPrice: 176.32, lotSize: 100, tickSize: 0.01 },

  // --- 2. Commodities (Global & Spot) ---
  { key: "GC1!", symbol: "GC1!", name: "COMEX GOLD (GC1!)", sector: "Commodities", category: "COMMODITY", currency: "USD", defaultPrice: 3891.50, lotSize: 100, tickSize: 0.10 },
  { key: "XAUUSDT", symbol: "XAUUSDT", name: "XAU/USDT (Gold Spot)", sector: "Commodities", category: "COMMODITY", currency: "USDT", defaultPrice: 3890.00, lotSize: 1, tickSize: 0.01 },
  { key: "XAGUSDT", symbol: "XAGUSDT", name: "XAG/USDT (Silver Spot)", sector: "Commodities", category: "COMMODITY", currency: "USDT", defaultPrice: 32.80, lotSize: 1, tickSize: 0.001 },
  { key: "CL1!", symbol: "CL1!", name: "CRUDE OIL (CL1!)", sector: "Commodities", category: "COMMODITY", currency: "USD", defaultPrice: 71.45, lotSize: 100, tickSize: 0.01 },
  { key: "SI1!", symbol: "SI1!", name: "COMEX SILVER (SI1!)", sector: "Commodities", category: "COMMODITY", currency: "USD", defaultPrice: 32.55, lotSize: 5000, tickSize: 0.005 },
  { key: "NG1!", symbol: "NG1!", name: "NATURAL GAS (NG1!)", sector: "Commodities", category: "COMMODITY", currency: "USD", defaultPrice: 2.85, lotSize: 10000, tickSize: 0.001 },

  // --- 3. 24/7 Crypto ---
  { key: "BTCUSDT", symbol: "BTCUSDT", name: "Bitcoin (BTC/USDT)", sector: "Crypto 24/7", category: "CRYPTO", currency: "USDT", defaultPrice: 76500.0, lotSize: 1, tickSize: 0.1 },
  { key: "ETHUSDT", symbol: "ETHUSDT", name: "Ethereum (ETH/USDT)", sector: "Crypto 24/7", category: "CRYPTO", currency: "USDT", defaultPrice: 2650.0, lotSize: 1, tickSize: 0.01 },
  { key: "SOLUSDT", symbol: "SOLUSDT", name: "Solana (SOL/USDT)", sector: "Crypto 24/7", category: "CRYPTO", currency: "USDT", defaultPrice: 185.5, lotSize: 1, tickSize: 0.01 },
  { key: "XRPUSDT", symbol: "XRPUSDT", name: "XRP (XRP/USDT)", sector: "Crypto 24/7", category: "CRYPTO", currency: "USDT", defaultPrice: 0.58, lotSize: 1, tickSize: 0.0001 },
  { key: "BTCINR", symbol: "BTCINR", name: "Bitcoin (BTC/INR)", sector: "Crypto 24/7", category: "CRYPTO", currency: "INR", defaultPrice: 7570000.0, lotSize: 1, tickSize: 1.0 },
  { key: "ETHINR", symbol: "ETHINR", name: "Ethereum (ETH/INR)", sector: "Crypto 24/7", category: "CRYPTO", currency: "INR", defaultPrice: 224000.0, lotSize: 1, tickSize: 0.5 },
  { key: "ETCUSDT", symbol: "ETCUSDT", name: "Ethereum Classic (ETC/USDT)", sector: "Crypto 24/7", category: "CRYPTO", currency: "USDT", defaultPrice: 19.5, lotSize: 1, tickSize: 0.01 },

  // --- 4. Banking & Financial Services (32 instruments) ---
  { key: "HDFCBANK", symbol: "HDFCBANK", name: "HDFC Bank", sector: "Banking", category: "FO_EQUITY", currency: "INR", defaultPrice: 798.15, lotSize: 550, tickSize: 0.05 },
  { key: "ICICIBANK", symbol: "ICICIBANK", name: "ICICI Bank", sector: "Banking", category: "FO_EQUITY", currency: "INR", defaultPrice: 1589.0, lotSize: 700, tickSize: 0.05 },
  { key: "SBIN", symbol: "SBIN", name: "State Bank of India", sector: "Banking", category: "FO_EQUITY", currency: "INR", defaultPrice: 1042.0, lotSize: 750, tickSize: 0.05 },
  { key: "AXISBANK", symbol: "AXISBANK", name: "Axis Bank", sector: "Banking", category: "FO_EQUITY", currency: "INR", defaultPrice: 1310.7, lotSize: 625, tickSize: 0.05 },
  { key: "KOTAKBANK", symbol: "KOTAKBANK", name: "Kotak Mahindra Bank", sector: "Banking", category: "FO_EQUITY", currency: "INR", defaultPrice: 479.5, lotSize: 400, tickSize: 0.05 },
  { key: "INDUSINDBK", symbol: "INDUSINDBK", name: "IndusInd Bank", sector: "Banking", category: "FO_EQUITY", currency: "INR", defaultPrice: 895.0, lotSize: 500, tickSize: 0.05 },
  { key: "BANKBARODA", symbol: "BANKBARODA", name: "Bank of Baroda", sector: "Banking", category: "FO_EQUITY", currency: "INR", defaultPrice: 260.01, lotSize: 2925, tickSize: 0.05 },
  { key: "PNB", symbol: "PNB", name: "Punjab National Bank", sector: "Banking", category: "FO_EQUITY", currency: "INR", defaultPrice: 132.17, lotSize: 8000, tickSize: 0.05 },
  { key: "CANBK", symbol: "CANBK", name: "Canara Bank", sector: "Banking", category: "FO_EQUITY", currency: "INR", defaultPrice: 128.1, lotSize: 6750, tickSize: 0.05 },
  { key: "IDFCFIRSTB", symbol: "IDFCFIRSTB", name: "IDFC First Bank", sector: "Banking", category: "FO_EQUITY", currency: "INR", defaultPrice: 77.87, lotSize: 7500, tickSize: 0.05 },
  { key: "FEDERALBNK", symbol: "FEDERALBNK", name: "Federal Bank", sector: "Banking", category: "FO_EQUITY", currency: "INR", defaultPrice: 344.1, lotSize: 5000, tickSize: 0.05 },
  { key: "AUBANK", symbol: "AUBANK", name: "AU Small Finance Bank", sector: "Banking", category: "FO_EQUITY", currency: "INR", defaultPrice: 929.0, lotSize: 500, tickSize: 0.05 },
  { key: "BANDHANBNK", symbol: "BANDHANBNK", name: "Bandhan Bank", sector: "Banking", category: "FO_EQUITY", currency: "INR", defaultPrice: 168.6, lotSize: 2500, tickSize: 0.05 },
  { key: "BAJFINANCE", symbol: "BAJFINANCE", name: "Bajaj Finance", sector: "Financial Services", category: "FO_EQUITY", currency: "INR", defaultPrice: 1064.85, lotSize: 125, tickSize: 0.05 },
  { key: "BAJAJFINSV", symbol: "BAJAJFINSV", name: "Bajaj Finserv", sector: "Financial Services", category: "FO_EQUITY", currency: "INR", defaultPrice: 1836.9, lotSize: 500, tickSize: 0.05 },
  { key: "CHOLAFIN", symbol: "CHOLAFIN", name: "Cholamandalam Investment", sector: "Financial Services", category: "FO_EQUITY", currency: "INR", defaultPrice: 1790.8, lotSize: 625, tickSize: 0.05 },
  { key: "MUTHOOTFIN", symbol: "MUTHOOTFIN", name: "Muthoot Finance", sector: "Financial Services", category: "FO_EQUITY", currency: "INR", defaultPrice: 2917.6, lotSize: 550, tickSize: 0.05 },
  { key: "SHRIRAMFIN", symbol: "SHRIRAMFIN", name: "Shriram Finance", sector: "Financial Services", category: "FO_EQUITY", currency: "INR", defaultPrice: 965.0, lotSize: 300, tickSize: 0.05 },
  { key: "SBILIFE", symbol: "SBILIFE", name: "SBI Life Insurance", sector: "Financial Services", category: "FO_EQUITY", currency: "INR", defaultPrice: 1748.0, lotSize: 750, tickSize: 0.05 },
  { key: "HDFCLIFE", symbol: "HDFCLIFE", name: "HDFC Life Insurance", sector: "Financial Services", category: "FO_EQUITY", currency: "INR", defaultPrice: 565.4, lotSize: 1100, tickSize: 0.05 },
  { key: "ICICIPRULI", symbol: "ICICIPRULI", name: "ICICI Prudential Life", sector: "Financial Services", category: "FO_EQUITY", currency: "INR", defaultPrice: 431.0, lotSize: 1500, tickSize: 0.05 },
  { key: "ICICIGI", symbol: "ICICIGI", name: "ICICI Lombard General Ins", sector: "Financial Services", category: "FO_EQUITY", currency: "INR", defaultPrice: 1659.9, lotSize: 500, tickSize: 0.05 },
  { key: "SBICARD", symbol: "SBICARD", name: "SBI Cards & Payment", sector: "Financial Services", category: "FO_EQUITY", currency: "INR", defaultPrice: 590.15, lotSize: 800, tickSize: 0.05 },
  { key: "M&MFIN", symbol: "M&MFIN", name: "M&M Financial Services", sector: "Financial Services", category: "FO_EQUITY", currency: "INR", defaultPrice: 280.25, lotSize: 2000, tickSize: 0.05 },
  { key: "L&TFH", symbol: "L&TFH", name: "L&T Finance Holdings", sector: "Financial Services", category: "FO_EQUITY", currency: "INR", defaultPrice: 273.7, lotSize: 4484, tickSize: 0.05 },
  { key: "PEL", symbol: "PEL", name: "Piramal Enterprises", sector: "Financial Services", category: "FO_EQUITY", currency: "INR", defaultPrice: 1045.0, lotSize: 750, tickSize: 0.05 },
  { key: "MANAPPURAM", symbol: "MANAPPURAM", name: "Manappuram Finance", sector: "Financial Services", category: "FO_EQUITY", currency: "INR", defaultPrice: 323.75, lotSize: 3000, tickSize: 0.05 },
  { key: "POONAWALLA", symbol: "POONAWALLA", name: "Poonawalla Fincorp", sector: "Financial Services", category: "FO_EQUITY", currency: "INR", defaultPrice: 474.35, lotSize: 1250, tickSize: 0.05 },
  { key: "LICHSGFIN", symbol: "LICHSGFIN", name: "LIC Housing Finance", sector: "Financial Services", category: "FO_EQUITY", currency: "INR", defaultPrice: 551.9, lotSize: 1000, tickSize: 0.05 },
  { key: "CANFINHOME", symbol: "CANFINHOME", name: "Can Fin Homes", sector: "Financial Services", category: "FO_EQUITY", currency: "INR", defaultPrice: 757.35, lotSize: 975, tickSize: 0.05 },
  { key: "RECLTD", symbol: "RECLTD", name: "REC Ltd", sector: "Financial Services", category: "FO_EQUITY", currency: "INR", defaultPrice: 305.15, lotSize: 2000, tickSize: 0.05 },
  { key: "PFC", symbol: "PFC", name: "Power Finance Corporation", sector: "Financial Services", category: "FO_EQUITY", currency: "INR", defaultPrice: 338.3, lotSize: 1550, tickSize: 0.05 },

  // --- 5. Information Technology (15 instruments) ---
  { key: "TCS", symbol: "TCS", name: "Tata Consultancy Services", sector: "Information Technology", category: "FO_EQUITY", currency: "INR", defaultPrice: 2475.4, lotSize: 175, tickSize: 0.05 },
  { key: "INFY", symbol: "INFY", name: "Infosys Ltd", sector: "Information Technology", category: "FO_EQUITY", currency: "INR", defaultPrice: 1154.1, lotSize: 400, tickSize: 0.05 },
  { key: "HCLTECH", symbol: "HCLTECH", name: "HCL Technologies", sector: "Information Technology", category: "FO_EQUITY", currency: "INR", defaultPrice: 1407.0, lotSize: 350, tickSize: 0.05 },
  { key: "WIPRO", symbol: "WIPRO", name: "Wipro Ltd", sector: "Information Technology", category: "FO_EQUITY", currency: "INR", defaultPrice: 199.0, lotSize: 1500, tickSize: 0.05 },
  { key: "TECHM", symbol: "TECHM", name: "Tech Mahindra", sector: "Information Technology", category: "FO_EQUITY", currency: "INR", defaultPrice: 1805.0, lotSize: 600, tickSize: 0.05 },
  { key: "LTIM", symbol: "LTIM", name: "LTIMindtree", sector: "Information Technology", category: "FO_EQUITY", currency: "INR", defaultPrice: 5950.0, lotSize: 150, tickSize: 0.05 },
  { key: "PERSISTENT", symbol: "PERSISTENT", name: "Persistent Systems", sector: "Information Technology", category: "FO_EQUITY", currency: "INR", defaultPrice: 6040.0, lotSize: 100, tickSize: 0.05 },
  { key: "COFORGE", symbol: "COFORGE", name: "Coforge Ltd", sector: "Information Technology", category: "FO_EQUITY", currency: "INR", defaultPrice: 2047.0, lotSize: 150, tickSize: 0.05 },
  { key: "MPHTASIS", symbol: "MPHTASIS", name: "Mphasis Ltd", sector: "Information Technology", category: "FO_EQUITY", currency: "INR", defaultPrice: 2455.0, lotSize: 275, tickSize: 0.05 },
  { key: "OFSS", symbol: "OFSS", name: "Oracle Financial Services", sector: "Information Technology", category: "FO_EQUITY", currency: "INR", defaultPrice: 10039.0, lotSize: 100, tickSize: 0.05 },
  { key: "LTTS", symbol: "LTTS", name: "L&T Technology Services", sector: "Information Technology", category: "FO_EQUITY", currency: "INR", defaultPrice: 4202.2, lotSize: 200, tickSize: 0.05 },
  { key: "TATAELXSI", symbol: "TATAELXSI", name: "Tata Elxsi", sector: "Information Technology", category: "FO_EQUITY", currency: "INR", defaultPrice: 3889.9, lotSize: 100, tickSize: 0.05 },
  { key: "KPITTECH", symbol: "KPITTECH", name: "KPIT Technologies", sector: "Information Technology", category: "FO_EQUITY", currency: "INR", defaultPrice: 542.35, lotSize: 500, tickSize: 0.05 },
  { key: "CYIENT", symbol: "CYIENT", name: "Cyient Ltd", sector: "Information Technology", category: "FO_EQUITY", currency: "INR", defaultPrice: 1092.6, lotSize: 325, tickSize: 0.05 },
  { key: "BIRLASOFT", symbol: "BIRLASOFT", name: "Birlasoft Ltd", sector: "Information Technology", category: "FO_EQUITY", currency: "INR", defaultPrice: 332.3, lotSize: 1000, tickSize: 0.05 },

  // --- 6. Automobiles & Auto Ancillaries (19 instruments) ---
  { key: "MARUTI", symbol: "MARUTI", name: "Maruti Suzuki", sector: "Automobiles", category: "FO_EQUITY", currency: "INR", defaultPrice: 12928.0, lotSize: 50, tickSize: 0.05 },
  { key: "TATAMOTORS", symbol: "TATAMOTORS", name: "Tata Motors", sector: "Automobiles", category: "FO_EQUITY", currency: "INR", defaultPrice: 840.0, lotSize: 550, tickSize: 0.05 },
  { key: "M&M", symbol: "M&M", name: "Mahindra & Mahindra", sector: "Automobiles", category: "FO_EQUITY", currency: "INR", defaultPrice: 3290.6, lotSize: 350, tickSize: 0.05 },
  { key: "BAJAJ-AUTO", symbol: "BAJAJ-AUTO", name: "Bajaj Auto", sector: "Automobiles", category: "FO_EQUITY", currency: "INR", defaultPrice: 10979.0, lotSize: 75, tickSize: 0.05 },
  { key: "HEROMOTOCO", symbol: "HEROMOTOCO", name: "Hero MotoCorp", sector: "Automobiles", category: "FO_EQUITY", currency: "INR", defaultPrice: 5744.0, lotSize: 150, tickSize: 0.05 },
  { key: "EICHERMOT", symbol: "EICHERMOT", name: "Eicher Motors", sector: "Automobiles", category: "FO_EQUITY", currency: "INR", defaultPrice: 7069.9, lotSize: 150, tickSize: 0.05 },
  { key: "TVSMOTOR", symbol: "TVSMOTOR", name: "TVS Motor Company", sector: "Automobiles", category: "FO_EQUITY", currency: "INR", defaultPrice: 3968.1, lotSize: 350, tickSize: 0.05 },
  { key: "BHARATFORG", symbol: "BHARATFORG", name: "Bharat Forge", sector: "Automobiles", category: "FO_EQUITY", currency: "INR", defaultPrice: 1259.9, lotSize: 500, tickSize: 0.05 },
  { key: "BOSCHLTD", symbol: "BOSCHLTD", name: "Bosch Ltd", sector: "Automobiles", category: "FO_EQUITY", currency: "INR", defaultPrice: 34500.0, lotSize: 25, tickSize: 0.05 },
  { key: "MOTHERSON", symbol: "MOTHERSON", name: "Samvardhana Motherson", sector: "Automobiles", category: "FO_EQUITY", currency: "INR", defaultPrice: 172.5, lotSize: 3100, tickSize: 0.05 },
  { key: "BALKRISIND", symbol: "BALKRISIND", name: "Balkrishna Industries", sector: "Automobiles", category: "FO_EQUITY", currency: "INR", defaultPrice: 2680.0, lotSize: 300, tickSize: 0.05 },
  { key: "APOLLOTYRE", symbol: "APOLLOTYRE", name: "Apollo Tyres", sector: "Automobiles", category: "FO_EQUITY", currency: "INR", defaultPrice: 535.0, lotSize: 1700, tickSize: 0.05 },
  { key: "MRF", symbol: "MRF", name: "MRF Ltd", sector: "Automobiles", category: "FO_EQUITY", currency: "INR", defaultPrice: 132400.0, lotSize: 10, tickSize: 0.05 },
  { key: "ASHOKLEY", symbol: "ASHOKLEY", name: "Ashok Leyland", sector: "Automobiles", category: "FO_EQUITY", currency: "INR", defaultPrice: 228.4, lotSize: 2500, tickSize: 0.05 },
  { key: "ESCORTS", symbol: "ESCORTS", name: "Escorts Kubota", sector: "Automobiles", category: "FO_EQUITY", currency: "INR", defaultPrice: 3670.0, lotSize: 175, tickSize: 0.05 },
  { key: "TIINDIA", symbol: "TIINDIA", name: "Tube Investments", sector: "Automobiles", category: "FO_EQUITY", currency: "INR", defaultPrice: 3590.0, lotSize: 200, tickSize: 0.05 },
  { key: "SONACOMS", symbol: "SONACOMS", name: "Sona BLW Precision", sector: "Automobiles", category: "FO_EQUITY", currency: "INR", defaultPrice: 620.0, lotSize: 950, tickSize: 0.05 },
  { key: "EXIDEIND", symbol: "EXIDEIND", name: "Exide Industries", sector: "Automobiles", category: "FO_EQUITY", currency: "INR", defaultPrice: 485.0, lotSize: 1800, tickSize: 0.05 },
  { key: "AMARAJABAT", symbol: "AMARAJABAT", name: "Amara Raja Energy", sector: "Automobiles", category: "FO_EQUITY", currency: "INR", defaultPrice: 1285.0, lotSize: 600, tickSize: 0.05 },

  // --- 7. Oil, Gas, Energy & Utilities (22 instruments) ---
  { key: "RELIANCE", symbol: "RELIANCE", name: "Reliance Industries", sector: "Energy & Utilities", category: "FO_EQUITY", currency: "INR", defaultPrice: 1421.3, lotSize: 500, tickSize: 0.05 },
  { key: "ONGC", symbol: "ONGC", name: "Oil & Natural Gas Corp", sector: "Energy & Utilities", category: "FO_EQUITY", currency: "INR", defaultPrice: 247.95, lotSize: 1925, tickSize: 0.05 },
  { key: "NTPC", symbol: "NTPC", name: "NTPC Ltd", sector: "Energy & Utilities", category: "FO_EQUITY", currency: "INR", defaultPrice: 341.2, lotSize: 1500, tickSize: 0.05 },
  { key: "POWERGRID", symbol: "POWERGRID", name: "Power Grid Corporation", sector: "Energy & Utilities", category: "FO_EQUITY", currency: "INR", defaultPrice: 297.65, lotSize: 1800, tickSize: 0.05 },
  { key: "COALINDIA", symbol: "COALINDIA", name: "Coal India", sector: "Energy & Utilities", category: "FO_EQUITY", currency: "INR", defaultPrice: 409.85, lotSize: 2100, tickSize: 0.05 },
  { key: "BPCL", symbol: "BPCL", name: "Bharat Petroleum", sector: "Energy & Utilities", category: "FO_EQUITY", currency: "INR", defaultPrice: 296.3, lotSize: 1800, tickSize: 0.05 },
  { key: "IOC", symbol: "IOC", name: "Indian Oil Corporation", sector: "Energy & Utilities", category: "FO_EQUITY", currency: "INR", defaultPrice: 141.6, lotSize: 4875, tickSize: 0.05 },
  { key: "HPCL", symbol: "HPCL", name: "Hindustan Petroleum", sector: "Energy & Utilities", category: "FO_EQUITY", currency: "INR", defaultPrice: 388.9, lotSize: 1350, tickSize: 0.05 },
  { key: "GAIL", symbol: "GAIL", name: "GAIL (India)", sector: "Energy & Utilities", category: "FO_EQUITY", currency: "INR", defaultPrice: 191.15, lotSize: 4675, tickSize: 0.05 },
  { key: "TATAPOWER", symbol: "TATAPOWER", name: "Tata Power", sector: "Energy & Utilities", category: "FO_EQUITY", currency: "INR", defaultPrice: 412.5, lotSize: 1350, tickSize: 0.05 },
  { key: "ADANIGREEN", symbol: "ADANIGREEN", name: "Adani Green Energy", sector: "Energy & Utilities", category: "FO_EQUITY", currency: "INR", defaultPrice: 1120.0, lotSize: 450, tickSize: 0.05 },
  { key: "ADANIPOWER", symbol: "ADANIPOWER", name: "Adani Power", sector: "Energy & Utilities", category: "FO_EQUITY", currency: "INR", defaultPrice: 585.0, lotSize: 875, tickSize: 0.05 },
  { key: "PETRONET", symbol: "PETRONET", name: "Petronet LNG", sector: "Energy & Utilities", category: "FO_EQUITY", currency: "INR", defaultPrice: 320.0, lotSize: 3000, tickSize: 0.05 },
  { key: "IGL", symbol: "IGL", name: "Indraprastha Gas", sector: "Energy & Utilities", category: "FO_EQUITY", currency: "INR", defaultPrice: 415.0, lotSize: 1375, tickSize: 0.05 },
  { key: "MGL", symbol: "MGL", name: "Mahanagar Gas", sector: "Energy & Utilities", category: "FO_EQUITY", currency: "INR", defaultPrice: 1620.0, lotSize: 400, tickSize: 0.05 },
  { key: "GUJGASLTD", symbol: "GUJGASLTD", name: "Gujarat Gas", sector: "Energy & Utilities", category: "FO_EQUITY", currency: "INR", defaultPrice: 535.0, lotSize: 1250, tickSize: 0.05 },

  // --- 8. Metals & Mining (14 instruments) ---
  { key: "TATASTEEL", symbol: "TATASTEEL", name: "Tata Steel", sector: "Metals & Mining", category: "FO_EQUITY", currency: "INR", defaultPrice: 147.2, lotSize: 5500, tickSize: 0.05 },
  { key: "JSWSTEEL", symbol: "JSWSTEEL", name: "JSW Steel", sector: "Metals & Mining", category: "FO_EQUITY", currency: "INR", defaultPrice: 948.5, lotSize: 675, tickSize: 0.05 },
  { key: "HINDALCO", symbol: "HINDALCO", name: "Hindalco Industries", sector: "Metals & Mining", category: "FO_EQUITY", currency: "INR", defaultPrice: 720.0, lotSize: 1400, tickSize: 0.05 },
  { key: "JINDALSTEL", symbol: "JINDALSTEL", name: "Jindal Steel & Power", sector: "Metals & Mining", category: "FO_EQUITY", currency: "INR", defaultPrice: 965.0, lotSize: 625, tickSize: 0.05 },
  { key: "VEDL", symbol: "VEDL", name: "Vedanta Ltd", sector: "Metals & Mining", category: "FO_EQUITY", currency: "INR", defaultPrice: 475.0, lotSize: 1150, tickSize: 0.05 },
  { key: "SAIL", symbol: "SAIL", name: "Steel Authority of India", sector: "Metals & Mining", category: "FO_EQUITY", currency: "INR", defaultPrice: 135.0, lotSize: 4000, tickSize: 0.05 },
  { key: "NMDC", symbol: "NMDC", name: "NMDC Ltd", sector: "Metals & Mining", category: "FO_EQUITY", currency: "INR", defaultPrice: 228.0, lotSize: 3375, tickSize: 0.05 },
  { key: "NATIONALUM", symbol: "NATIONALUM", name: "National Aluminium", sector: "Metals & Mining", category: "FO_EQUITY", currency: "INR", defaultPrice: 198.0, lotSize: 3750, tickSize: 0.05 },
  { key: "HINDCOPPER", symbol: "HINDCOPPER", name: "Hindustan Copper", sector: "Metals & Mining", category: "FO_EQUITY", currency: "INR", defaultPrice: 285.0, lotSize: 2650, tickSize: 0.05 },

  // --- 9. Pharmaceuticals & Healthcare (18 instruments) ---
  { key: "SUNPHARMA", symbol: "SUNPHARMA", name: "Sun Pharmaceutical", sector: "Pharma & Healthcare", category: "FO_EQUITY", currency: "INR", defaultPrice: 1780.0, lotSize: 350, tickSize: 0.05 },
  { key: "DRREDDY", symbol: "DRREDDY", name: "Dr. Reddy's Laboratories", sector: "Pharma & Healthcare", category: "FO_EQUITY", currency: "INR", defaultPrice: 1240.0, lotSize: 125, tickSize: 0.05 },
  { key: "CIPLA", symbol: "CIPLA", name: "Cipla Ltd", sector: "Pharma & Healthcare", category: "FO_EQUITY", currency: "INR", defaultPrice: 1540.0, lotSize: 650, tickSize: 0.05 },
  { key: "DIVISLAB", symbol: "DIVISLAB", name: "Divi's Laboratories", sector: "Pharma & Healthcare", category: "FO_EQUITY", currency: "INR", defaultPrice: 5350.0, lotSize: 100, tickSize: 0.05 },
  { key: "APOLLOHOSP", symbol: "APOLLOHOSP", name: "Apollo Hospitals", sector: "Pharma & Healthcare", category: "FO_EQUITY", currency: "INR", defaultPrice: 6950.0, lotSize: 125, tickSize: 0.05 },
  { key: "LUPIN", symbol: "LUPIN", name: "Lupin Ltd", sector: "Pharma & Healthcare", category: "FO_EQUITY", currency: "INR", defaultPrice: 2150.0, lotSize: 425, tickSize: 0.05 },
  { key: "AUROPHARMA", symbol: "AUROPHARMA", name: "Aurobindo Pharma", sector: "Pharma & Healthcare", category: "FO_EQUITY", currency: "INR", defaultPrice: 1380.0, lotSize: 550, tickSize: 0.05 },
  { key: "ZYDUSLIFE", symbol: "ZYDUSLIFE", name: "Zydus Lifesciences", sector: "Pharma & Healthcare", category: "FO_EQUITY", currency: "INR", defaultPrice: 1050.0, lotSize: 900, tickSize: 0.05 },
  { key: "TORNTPHARM", symbol: "TORNTPHARM", name: "Torrent Pharmaceuticals", sector: "Pharma & Healthcare", category: "FO_EQUITY", currency: "INR", defaultPrice: 3250.0, lotSize: 250, tickSize: 0.05 },
  { key: "BIOCON", symbol: "BIOCON", name: "Biocon Ltd", sector: "Pharma & Healthcare", category: "FO_EQUITY", currency: "INR", defaultPrice: 345.0, lotSize: 2500, tickSize: 0.05 },

  // --- 10. FMCG & Consumer (18 instruments) ---
  { key: "HINDUNILVR", symbol: "HINDUNILVR", name: "Hindustan Unilever", sector: "FMCG & Consumer", category: "FO_EQUITY", currency: "INR", defaultPrice: 2420.0, lotSize: 300, tickSize: 0.05 },
  { key: "ITC", symbol: "ITC", name: "ITC Ltd", sector: "FMCG & Consumer", category: "FO_EQUITY", currency: "INR", defaultPrice: 478.0, lotSize: 1600, tickSize: 0.05 },
  { key: "NESTLEIND", symbol: "NESTLEIND", name: "Nestle India", sector: "FMCG & Consumer", category: "FO_EQUITY", currency: "INR", defaultPrice: 1297.8, lotSize: 200, tickSize: 0.05 },
  { key: "BRITANNIA", symbol: "BRITANNIA", name: "Britannia Industries", sector: "FMCG & Consumer", category: "FO_EQUITY", currency: "INR", defaultPrice: 4790.0, lotSize: 100, tickSize: 0.05 },
  { key: "TATACONSUM", symbol: "TATACONSUM", name: "Tata Consumer Products", sector: "FMCG & Consumer", category: "FO_EQUITY", currency: "INR", defaultPrice: 1083.9, lotSize: 550, tickSize: 0.05 },
  { key: "DABUR", symbol: "DABUR", name: "Dabur India", sector: "FMCG & Consumer", category: "FO_EQUITY", currency: "INR", defaultPrice: 375.25, lotSize: 1250, tickSize: 0.05 },
  { key: "TITAN", symbol: "TITAN", name: "Titan Company", sector: "FMCG & Consumer", category: "FO_EQUITY", currency: "INR", defaultPrice: 5005.0, lotSize: 175, tickSize: 0.05 },
  { key: "HAVELLS", symbol: "HAVELLS", name: "Havells India", sector: "FMCG & Consumer", category: "FO_EQUITY", currency: "INR", defaultPrice: 1159.5, lotSize: 500, tickSize: 0.05 },
  { key: "VOLTAS", symbol: "VOLTAS", name: "Voltas Ltd", sector: "FMCG & Consumer", category: "FO_EQUITY", currency: "INR", defaultPrice: 1090.1, lotSize: 400, tickSize: 0.05 },
  { key: "DIXON", symbol: "DIXON", name: "Dixon Technologies", sector: "FMCG & Consumer", category: "FO_EQUITY", currency: "INR", defaultPrice: 12603.0, lotSize: 100, tickSize: 0.05 },
  { key: "VBL", symbol: "VBL", name: "Varun Beverages", sector: "FMCG & Consumer", category: "FO_EQUITY", currency: "INR", defaultPrice: 435.0, lotSize: 1000, tickSize: 0.05 },

  // --- 11. Capital Goods, Infrastructure & Defence (19 instruments) ---
  { key: "LT", symbol: "LT", name: "Larsen & Toubro", sector: "Capital Goods & Infra", category: "FO_EQUITY", currency: "INR", defaultPrice: 4185.0, lotSize: 150, tickSize: 0.05 },
  { key: "HAL", symbol: "HAL", name: "Hindustan Aeronautics", sector: "Capital Goods & Infra", category: "FO_EQUITY", currency: "INR", defaultPrice: 4999.0, lotSize: 150, tickSize: 0.05 },
  { key: "BEL", symbol: "BEL", name: "Bharat Electronics", sector: "Capital Goods & Infra", category: "FO_EQUITY", currency: "INR", defaultPrice: 394.55, lotSize: 1900, tickSize: 0.05 },
  { key: "SIEMENS", symbol: "SIEMENS", name: "Siemens Ltd", sector: "Capital Goods & Infra", category: "FO_EQUITY", currency: "INR", defaultPrice: 3655.0, lotSize: 125, tickSize: 0.05 },
  { key: "ABB", symbol: "ABB", name: "ABB India", sector: "Capital Goods & Infra", category: "FO_EQUITY", currency: "INR", defaultPrice: 6915.0, lotSize: 125, tickSize: 0.05 },
  { key: "BHEL", symbol: "BHEL", name: "Bharat Heavy Electricals", sector: "Capital Goods & Infra", category: "FO_EQUITY", currency: "INR", defaultPrice: 422.95, lotSize: 2250, tickSize: 0.05 },
  { key: "POLYCAB", symbol: "POLYCAB", name: "Polycab India", sector: "Capital Goods & Infra", category: "FO_EQUITY", currency: "INR", defaultPrice: 7832.5, lotSize: 125, tickSize: 0.05 },
  { key: "ADANIPORTS", symbol: "ADANIPORTS", name: "Adani Ports & SEZ", sector: "Capital Goods & Infra", category: "FO_EQUITY", currency: "INR", defaultPrice: 1942.7, lotSize: 400, tickSize: 0.05 },
  { key: "ADANIENT", symbol: "ADANIENT", name: "Adani Enterprises", sector: "Capital Goods & Infra", category: "FO_EQUITY", currency: "INR", defaultPrice: 2706.3, lotSize: 300, tickSize: 0.05 },

  // --- 12. Real Estate & Cement (14 instruments) ---
  { key: "ULTRACEMCO", symbol: "ULTRACEMCO", name: "UltraTech Cement", sector: "Real Estate & Cement", category: "FO_EQUITY", currency: "INR", defaultPrice: 12275.0, lotSize: 50, tickSize: 0.05 },
  { key: "AMBUJACEM", symbol: "AMBUJACEM", name: "Ambuja Cements", sector: "Real Estate & Cement", category: "FO_EQUITY", currency: "INR", defaultPrice: 389.55, lotSize: 900, tickSize: 0.05 },
  { key: "ACC", symbol: "ACC", name: "ACC Ltd", sector: "Real Estate & Cement", category: "FO_EQUITY", currency: "INR", defaultPrice: 1234.9, lotSize: 250, tickSize: 0.05 },
  { key: "DLF", symbol: "DLF", name: "DLF Ltd", sector: "Real Estate & Cement", category: "FO_EQUITY", currency: "INR", defaultPrice: 755.0, lotSize: 825, tickSize: 0.05 },
  { key: "GODREJPROP", symbol: "GODREJPROP", name: "Godrej Properties", sector: "Real Estate & Cement", category: "FO_EQUITY", currency: "INR", defaultPrice: 1814.6, lotSize: 275, tickSize: 0.05 },

  // --- 13. Telecom, Consumer Tech & Retail ---
  { key: "BHARTIARTL", symbol: "BHARTIARTL", name: "Bharti Airtel", sector: "Telecom & Tech", category: "FO_EQUITY", currency: "INR", defaultPrice: 2072.1, lotSize: 475, tickSize: 0.05 },
  { key: "TRENT", symbol: "TRENT", name: "Trent Ltd", sector: "Consumer Services", category: "FO_EQUITY", currency: "INR", defaultPrice: 3119.2, lotSize: 200, tickSize: 0.05 },
  { key: "ZOMATO", symbol: "ZOMATO", name: "Zomato Ltd", sector: "Consumer Services", category: "FO_EQUITY", currency: "INR", defaultPrice: 363.45, lotSize: 2000, tickSize: 0.05 },
  { key: "NAUKRI", symbol: "NAUKRI", name: "Info Edge (India)", sector: "Telecom & Tech", category: "FO_EQUITY", currency: "INR", defaultPrice: 1200.2, lotSize: 125, tickSize: 0.05 },
  { key: "INDHOTEL", symbol: "INDHOTEL", name: "Indian Hotels Company", sector: "Consumer Services", category: "FO_EQUITY", currency: "INR", defaultPrice: 891.65, lotSize: 500, tickSize: 0.05 },
  { key: "IRCTC", symbol: "IRCTC", name: "IRCTC Ltd", sector: "Consumer Services", category: "FO_EQUITY", currency: "INR", defaultPrice: 459.95, lotSize: 875, tickSize: 0.05 },
] as const;

/**
 * Quick-select symbols for the primary toolbar pills
 */
export const QUICK_SELECT_SYMBOLS: readonly { key: string; label: string }[] = [
  { key: "NIFTY50", label: "NIFTY 50" },
  { key: "BANKNIFTY", label: "BANK NIFTY" },
  { key: "SENSEX", label: "SENSEX" },
  { key: "INDIA_VIX", label: "INDIA VIX" },
  { key: "GC1!", label: "GOLD" },
  { key: "SI1!", label: "SILVER" },
] as const;

/**
 * Standard Multi-Timeframe intervals
 */
export const TIMEFRAMES = [
  { label: "1m", ms: 60_000 },
  { label: "3m", ms: 180_000 },
  { label: "5m", ms: 300_000 },
  { label: "15m", ms: 900_000 },
  { label: "30m", ms: 1_800_000 },
  { label: "1h", ms: 3_600_000 },
  { label: "4h", ms: 14_400_000 },
  { label: "1D", ms: 86_400_000 },
  { label: "1W", ms: 604_800_000 },
] as const;

/**
 * Fast lookup helper for any instrument by key or symbol
 */
export function findInstrument(query: string): UniversalInstrument | null {
  if (!query) return null;
  const upper = query.trim().toUpperCase();
  const direct = UNIVERSAL_INSTRUMENTS.find(
    (i) => i.key.toUpperCase() === upper || i.symbol.toUpperCase() === upper,
  );
  if (direct) return direct;

  // Partial or alias matching
  if (upper === "NIFTY" || upper === "NIFTY 50") return findInstrument("NIFTY50");
  if (upper === "BANK NIFTY" || upper === "BANK") return findInstrument("BANKNIFTY");
  if (upper === "GOLD") return findInstrument("GC1!");
  if (upper === "SILVER") return findInstrument("SI1!");
  if (upper === "CRUDE") return findInstrument("CL1!");
  if (upper === "BTC") return findInstrument("BTCUSDT");
  if (upper === "ETH") return findInstrument("ETHUSDT");

  return null;
}

/**
 * Real-time auto-complete search with category filter
 */
export function searchInstruments(
  query: string,
  categoryFilter?: "ALL" | AssetClass,
): UniversalInstrument[] {
  const q = query.trim().toUpperCase();
  return UNIVERSAL_INSTRUMENTS.filter((inst) => {
    if (categoryFilter && categoryFilter !== "ALL" && inst.category !== categoryFilter) {
      return false;
    }
    if (!q) return true;
    return (
      inst.key.toUpperCase().includes(q) ||
      inst.symbol.toUpperCase().includes(q) ||
      inst.name.toUpperCase().includes(q) ||
      inst.sector.toUpperCase().includes(q)
    );
  });
}
