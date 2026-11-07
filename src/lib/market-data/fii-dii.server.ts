import fs from "node:fs";
import path from "node:path";

export interface FiiCashData {
  buy: number;
  sell: number;
  net: number;
}

export interface DiiCashData {
  buy: number;
  sell: number;
  net: number;
}

export type InstitutionalSentiment =
  | "BULLISH"
  | "MILDLY_BULLISH"
  | "NEUTRAL"
  | "MILDLY_BEARISH"
  | "BEARISH";

export interface FnoParticipantData {
  fiiIndexFuturesNet: number;
  fiiIndexOptionsNet: number;
  sentiment: InstitutionalSentiment;
}

export interface FiiDiiStandardContract {
  date: string; // ISO yyyy-mm-dd
  fii: FiiCashData;
  dii: DiiCashData;
  fno: FnoParticipantData;
  status: "LIVE" | "EOD_CONFIRMED";
}

export interface FiiDiiRow {
  date: string; // ISO yyyy-mm-dd
  label: string; // e.g. "06 Nov"
  fiiCash: number; // ₹ Cr net
  diiCash: number; // ₹ Cr net
  fiiFuture: number; // Contracts net
  fii?: FiiCashData;
  dii?: DiiCashData;
  fno?: FnoParticipantData;
}

export interface FiiDiiCombinedPayload extends FiiDiiStandardContract {
  rows: FiiDiiRow[];
  fetchedAt: string;
  source: "NSE_LIVE" | "CACHE" | "FALLBACK";
}

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const MONTHS_MAP: Record<string, string> = {
  Jan: "01",
  Feb: "02",
  Mar: "03",
  Apr: "04",
  May: "05",
  Jun: "06",
  Jul: "07",
  Aug: "08",
  Sep: "09",
  Oct: "10",
  Nov: "11",
  Dec: "12",
};

interface CookieSession {
  cookieHeader: string;
  expiresAt: number;
}

let memoryCookieSession: CookieSession | null = null;
const COOKIE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Format raw date like "06-Nov-2026" into { iso: "2026-11-06", label: "06 Nov" }.
 */
export function parseNseDate(rawDate: string): { iso: string; label: string } {
  const trimmed = rawDate.trim();
  const match = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(trimmed);
  if (!match) {
    return { iso: trimmed, label: trimmed };
  }
  const [, d, mon, y] = match;
  const monthNum = MONTHS_MAP[mon] ?? "01";
  const dayPad = d.padStart(2, "0");
  return {
    iso: `${y}-${monthNum}-${dayPad}`,
    label: `${dayPad} ${mon}`,
  };
}

/**
 * Parse numeric values safely, removing commas and normalizing decimals.
 */
export function cleanNumber(val: unknown): number {
  if (typeof val === "number") {
    return Number.isFinite(val) ? val : 0;
  }
  if (typeof val === "string") {
    const cleaned = val.replace(/,/g, "").trim();
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/**
 * Perform a warmup GET to NSE India to acquire session cookies.
 */
export async function warmupNseCookies(force = false): Promise<string> {
  const now = Date.now();
  if (!force && memoryCookieSession && memoryCookieSession.expiresAt > now) {
    return memoryCookieSession.cookieHeader;
  }

  try {
    const res = await fetch("https://www.nseindia.com", {
      headers: {
        "User-Agent": DEFAULT_USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        Connection: "keep-alive",
      },
      signal: AbortSignal.timeout(8000),
    });

    const setCookies: string[] =
      typeof res.headers.getSetCookie === "function"
        ? res.headers.getSetCookie()
        : [res.headers.get("set-cookie") ?? ""].filter(Boolean);

    const cookiePairs = setCookies
      .map((c) => c.split(";")[0].trim())
      .filter((c) => c.length > 0 && c.includes("="));

    const cookieHeader = cookiePairs.join("; ");
    if (cookieHeader) {
      memoryCookieSession = {
        cookieHeader,
        expiresAt: now + COOKIE_TTL_MS,
      };
      return cookieHeader;
    }
  } catch {
    // Warmup failed - return whatever is cached or empty string
  }

  return memoryCookieSession?.cookieHeader ?? "";
}

/**
 * Classify market sentiment based on FII F&O positioning and cash flows.
 */
export function classifySentiment(
  futuresNet: number,
  optionsNet: number,
  fiiCashNet: number,
): InstitutionalSentiment {
  if (futuresNet <= -25000) {
    return optionsNet < 0 || fiiCashNet < 0 ? "BEARISH" : "MILDLY_BEARISH";
  }
  if (futuresNet <= -5000) {
    return "MILDLY_BEARISH";
  }
  if (futuresNet >= 25000) {
    return optionsNet > 0 || fiiCashNet > 0 ? "BULLISH" : "MILDLY_BULLISH";
  }
  if (futuresNet >= 5000) {
    return "MILDLY_BULLISH";
  }

  // Composite check when futures are around neutral (-5000 to +5000)
  if (fiiCashNet >= 2500) return "BULLISH";
  if (fiiCashNet >= 1000) return "MILDLY_BULLISH";
  if (fiiCashNet <= -2500) return "BEARISH";
  if (fiiCashNet <= -1000) return "MILDLY_BEARISH";

  return "NEUTRAL";
}

/**
 * Determine if current session status is "LIVE" or "EOD_CONFIRMED".
 */
export function determineMarketStatus(tradeDateIso: string): "LIVE" | "EOD_CONFIRMED" {
  // IST is UTC + 5:30
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(now.getTime() + istOffset);
  const istDateStr = istDate.toISOString().slice(0, 10);
  const dayOfWeek = istDate.getUTCDay(); // 0 = Sun, 6 = Sat

  // Is today a weekday and matches the trade date?
  if (istDateStr === tradeDateIso && dayOfWeek >= 1 && dayOfWeek <= 5) {
    const hours = istDate.getUTCHours();
    const minutes = istDate.getUTCMinutes();
    const timeVal = hours * 60 + minutes;
    // Market hours in IST: 09:15 to 15:30 (555 mins to 930 mins)
    if (timeVal >= 555 && timeVal <= 930) {
      return "LIVE";
    }
  }

  return "EOD_CONFIRMED";
}

/**
 * Fetch F&O participant OI from NSE CC archives.
 */
export async function fetchNseParticipantOi(
  isoDate: string,
): Promise<{ fiiIndexFuturesNet: number; fiiIndexOptionsNet: number } | null> {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return null;
  const [, y, m, d] = match;
  const ddmmyyyy = `${d}${m}${y}`;
  const url = `https://nsearchives.nseindia.com/content/nsccl/fao_participant_oi_${ddmmyyyy}.csv`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": DEFAULT_USER_AGENT, Accept: "text/csv, */*" },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.includes("Participant wise Open Interest")) return null;

    const line = text.split(/\r?\n/).find((l) => /^FII\s*,/i.test(l.trim()));
    if (!line) return null;

    const parts = line.split(",").map((s) => s.trim());
    const futLong = cleanNumber(parts[1]);
    const futShort = cleanNumber(parts[2]);
    const optCallLong = cleanNumber(parts[5]);
    const optPutLong = cleanNumber(parts[6]);
    const optCallShort = cleanNumber(parts[7]);
    const optPutShort = cleanNumber(parts[8]);

    const fiiIndexFuturesNet = futLong - futShort;
    const netCalls = optCallLong - optCallShort;
    const netPuts = optPutLong - optPutShort;
    const fiiIndexOptionsNet = netCalls - netPuts;

    return { fiiIndexFuturesNet, fiiIndexOptionsNet };
  } catch {
    return null;
  }
}

/**
 * Primary Ingestion: Fetch live FII/DII cash data from NSE India API.
 */
export async function fetchNseLiveFiiDii(): Promise<{
  date: string;
  label: string;
  fii: FiiCashData;
  dii: DiiCashData;
} | null> {
  let cookie = await warmupNseCookies(false);

  const executeApiCall = async (cookieHeader: string) => {
    return fetch("https://www.nseindia.com/api/fiidiiTradeReact", {
      headers: {
        "User-Agent": DEFAULT_USER_AGENT,
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: "https://www.nseindia.com/reports/fii-dii",
        Cookie: cookieHeader,
      },
      signal: AbortSignal.timeout(8000),
    });
  };

  let res: Response;
  try {
    res = await executeApiCall(cookie);
    if (res.status === 401 || res.status === 403) {
      // Cookie expired or invalidated; refresh once
      cookie = await warmupNseCookies(true);
      res = await executeApiCall(cookie);
    }
  } catch {
    return null;
  }

  if (!res.ok) return null;

  try {
    interface NseItem {
      category?: string;
      date?: string;
      buyValue?: string | number;
      sellValue?: string | number;
      netValue?: string | number;
    }

    const json = (await res.json()) as NseItem[];
    if (!Array.isArray(json) || json.length === 0) return null;

    const fiiItem = json.find((i) => /FII|FPI/i.test(i.category ?? ""));
    const diiItem = json.find((i) => /DII/i.test(i.category ?? ""));

    if (!fiiItem || !fiiItem.date) return null;

    const { iso, label } = parseNseDate(fiiItem.date);

    const fiiBuy = cleanNumber(fiiItem.buyValue);
    const fiiSell = cleanNumber(fiiItem.sellValue);
    const fiiNet = cleanNumber(fiiItem.netValue) || fiiBuy - fiiSell;

    const diiBuy = diiItem ? cleanNumber(diiItem.buyValue) : 0;
    const diiSell = diiItem ? cleanNumber(diiItem.sellValue) : 0;
    const diiNet = diiItem ? cleanNumber(diiItem.netValue) || diiBuy - diiSell : 0;

    return {
      date: iso,
      label,
      fii: { buy: fiiBuy, sell: fiiSell, net: fiiNet },
      dii: { buy: diiBuy, sell: diiSell, net: diiNet },
    };
  } catch {
    return null;
  }
}

/**
 * Locate the persistent EOD cache file on disk.
 */
function getCacheFilePath(): string {
  const cwd = process.cwd();
  return path.resolve(cwd, "config", "fii-dii-cache.json");
}

/**
 * Read the EOD cache from disk.
 */
export function readFiiDiiCache(): {
  date: string;
  fii: FiiCashData;
  dii: DiiCashData;
  fno: FnoParticipantData;
  status: "LIVE" | "EOD_CONFIRMED";
  history: FiiDiiRow[];
} | null {
  try {
    const filePath = getCacheFilePath();
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(content);
    if (parsed && parsed.date && parsed.fii && parsed.dii) {
      return parsed;
    }
  } catch {
    // Ignore read errors
  }
  return null;
}

/**
 * Write updated data to disk cache.
 */
export function writeFiiDiiCache(data: {
  date: string;
  fii: FiiCashData;
  dii: DiiCashData;
  fno: FnoParticipantData;
  status: "LIVE" | "EOD_CONFIRMED";
  history: FiiDiiRow[];
}): void {
  try {
    const filePath = getCacheFilePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const payload = {
      ...data,
      lastUpdated: new Date().toISOString(),
    };
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf-8");
  } catch {
    // Ignore write errors in read-only environments
  }
}

/**
 * Main orchestrated ingestion engine.
 * Multi-tier pipeline:
 * 1. Fetch live NSE cash and participant OI with cookie warmup.
 * 2. If fresh data retrieved, update persistent EOD cache on disk.
 * 3. If live fetch returns null/403/weekend, serve cached session data seamlessly.
 */
export async function getFiiDiiData(): Promise<FiiDiiCombinedPayload> {
  const cached = readFiiDiiCache();

  try {
    const liveCash = await fetchNseLiveFiiDii();
    if (liveCash) {
      const fnoData = (await fetchNseParticipantOi(liveCash.date)) ?? {
        fiiIndexFuturesNet: cached?.fno?.fiiIndexFuturesNet ?? 0,
        fiiIndexOptionsNet: cached?.fno?.fiiIndexOptionsNet ?? 0,
      };

      const sentiment = classifySentiment(
        fnoData.fiiIndexFuturesNet,
        fnoData.fiiIndexOptionsNet,
        liveCash.fii.net,
      );

      const fno: FnoParticipantData = {
        ...fnoData,
        sentiment,
      };

      const status = determineMarketStatus(liveCash.date);

      // Construct current row
      const currentRow: FiiDiiRow = {
        date: liveCash.date,
        label: liveCash.label,
        fiiCash: liveCash.fii.net,
        diiCash: liveCash.dii.net,
        fiiFuture: fno.fiiIndexFuturesNet,
        fii: liveCash.fii,
        dii: liveCash.dii,
        fno,
      };

      // Merge into history
      const existingHistory = cached?.history ?? [];
      const updatedHistory = [
        currentRow,
        ...existingHistory.filter((r) => r.date !== liveCash.date),
      ].slice(0, 30);

      // Update disk cache
      writeFiiDiiCache({
        date: liveCash.date,
        fii: liveCash.fii,
        dii: liveCash.dii,
        fno,
        status,
        history: updatedHistory,
      });

      return {
        date: liveCash.date,
        fii: liveCash.fii,
        dii: liveCash.dii,
        fno,
        status,
        rows: updatedHistory,
        fetchedAt: new Date().toISOString(),
        source: "NSE_LIVE",
      };
    }
  } catch {
    // Network or parse issue; fall back to cache
  }

  // Fallback to cache if available
  if (cached) {
    const status = determineMarketStatus(cached.date);
    return {
      date: cached.date,
      fii: cached.fii,
      dii: cached.dii,
      fno: cached.fno,
      status,
      rows: cached.history ?? [],
      fetchedAt: new Date().toISOString(),
      source: "CACHE",
    };
  }

  // Hard fallback default if disk cache missing
  const defaultRow: FiiDiiRow = {
    date: "2026-11-06",
    label: "06 Nov",
    fiiCash: 13749.82,
    diiCash: -5968.7,
    fiiFuture: -100416,
    fii: { buy: 30455.63, sell: 16705.81, net: 13749.82 },
    dii: { buy: 18084.32, sell: 24053.02, net: -5968.7 },
    fno: {
      fiiIndexFuturesNet: -100416,
      fiiIndexOptionsNet: -577365,
      sentiment: "BEARISH",
    },
  };

  return {
    date: "2026-11-06",
    fii: { buy: 30455.63, sell: 16705.81, net: 13749.82 },
    dii: { buy: 18084.32, sell: 24053.02, net: -5968.7 },
    fno: {
      fiiIndexFuturesNet: -100416,
      fiiIndexOptionsNet: -577365,
      sentiment: "BEARISH",
    },
    status: "EOD_CONFIRMED",
    rows: [defaultRow],
    fetchedAt: new Date().toISOString(),
    source: "FALLBACK",
  };
}
