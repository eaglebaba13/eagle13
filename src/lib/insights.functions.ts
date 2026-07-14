import { createServerFn } from "@tanstack/react-start";
import { fetchJson, fetchTextSafe } from "./http";
import { cached } from "./server-cache";
import { YahooSparkSchema, parseProvider } from "./providers";

const round2 = (n: number) => Math.round(n * 100) / 100;

/* ------------------------------ types ------------------------------ */

export type Mover = {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  change: number;
  changePct: number;
};

export type Sector = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  leaders: Mover[]; // top movers within the sector
};

export type NewsItem = {
  title: string;
  source: string;
  link: string;
  time: string;
};

/* ------------------------------ spark ------------------------------ */

type SparkMeta = {
  symbol: string;
  shortName?: string;
  longName?: string;
  regularMarketPrice?: number;
  chartPreviousClose?: number;
};

async function fetchSpark(symbols: string[]): Promise<Map<string, SparkMeta>> {
  const out = new Map<string, SparkMeta>();
  // chunk to keep URLs reasonable
  const chunkSize = 45;
  for (let i = 0; i < symbols.length; i += chunkSize) {
    const chunk = symbols.slice(i, i + chunkSize);
    const url = `https://query1.finance.yahoo.com/v7/finance/spark?symbols=${encodeURIComponent(
      chunk.join(","),
    )}&range=2d&interval=1d`;
    try {
      const json = parseProvider(YahooSparkSchema, await fetchJson<unknown>(url), "Yahoo spark");
      const results = json.spark?.result ?? [];
      for (const r of results) {
        const m = r.response?.[0]?.meta;
        if (m?.symbol) {
          out.set(m.symbol, {
            symbol: m.symbol,
            shortName: m.shortName,
            longName: m.longName,
            regularMarketPrice: m.regularMarketPrice,
            chartPreviousClose: m.chartPreviousClose,
          });
        }
      }
    } catch {
      // Skip this chunk on failure; partial data is better than none.
      continue;
    }
  }
  return out;
}

function toMover(meta: SparkMeta, name: string, sector: string): Mover | null {
  const price = meta.regularMarketPrice;
  const prev = meta.chartPreviousClose;
  if (price == null || prev == null || prev === 0) return null;
  const change = price - prev;
  return {
    symbol: meta.symbol,
    name,
    sector,
    price: round2(price),
    change: round2(change),
    changePct: round2((change / prev) * 100),
  };
}

/* --------------------------- F&O universe -------------------------- */

// Liquid F&O stocks grouped by sector (Yahoo .NS symbols)
const UNIVERSE: { sym: string; name: string; sector: string }[] = [
  { sym: "HDFCBANK.NS", name: "HDFC Bank", sector: "Bank" },
  { sym: "ICICIBANK.NS", name: "ICICI Bank", sector: "Bank" },
  { sym: "SBIN.NS", name: "SBI", sector: "Bank" },
  { sym: "AXISBANK.NS", name: "Axis Bank", sector: "Bank" },
  { sym: "KOTAKBANK.NS", name: "Kotak Bank", sector: "Bank" },
  { sym: "INDUSINDBK.NS", name: "IndusInd Bank", sector: "Bank" },
  { sym: "BANKBARODA.NS", name: "Bank of Baroda", sector: "PSU Bank" },
  { sym: "PNB.NS", name: "PNB", sector: "PSU Bank" },
  { sym: "TCS.NS", name: "TCS", sector: "IT" },
  { sym: "INFY.NS", name: "Infosys", sector: "IT" },
  { sym: "WIPRO.NS", name: "Wipro", sector: "IT" },
  { sym: "HCLTECH.NS", name: "HCL Tech", sector: "IT" },
  { sym: "TECHM.NS", name: "Tech Mahindra", sector: "IT" },
  { sym: "LTIM.NS", name: "LTIMindtree", sector: "IT" },
  { sym: "RELIANCE.NS", name: "Reliance", sector: "Energy" },
  { sym: "ONGC.NS", name: "ONGC", sector: "Energy" },
  { sym: "NTPC.NS", name: "NTPC", sector: "Energy" },
  { sym: "POWERGRID.NS", name: "Power Grid", sector: "Energy" },
  { sym: "TATAPOWER.NS", name: "Tata Power", sector: "Energy" },
  { sym: "BPCL.NS", name: "BPCL", sector: "Energy" },
  { sym: "MARUTI.NS", name: "Maruti", sector: "Auto" },
  { sym: "TATAMOTORS.NS", name: "Tata Motors", sector: "Auto" },
  { sym: "M&M.NS", name: "M&M", sector: "Auto" },
  { sym: "BAJAJ-AUTO.NS", name: "Bajaj Auto", sector: "Auto" },
  { sym: "EICHERMOT.NS", name: "Eicher Motors", sector: "Auto" },
  { sym: "HEROMOTOCO.NS", name: "Hero MotoCorp", sector: "Auto" },
  { sym: "SUNPHARMA.NS", name: "Sun Pharma", sector: "Pharma" },
  { sym: "CIPLA.NS", name: "Cipla", sector: "Pharma" },
  { sym: "DRREDDY.NS", name: "Dr Reddy's", sector: "Pharma" },
  { sym: "DIVISLAB.NS", name: "Divi's Lab", sector: "Pharma" },
  { sym: "AUROPHARMA.NS", name: "Aurobindo", sector: "Pharma" },
  { sym: "HINDUNILVR.NS", name: "HUL", sector: "FMCG" },
  { sym: "ITC.NS", name: "ITC", sector: "FMCG" },
  { sym: "NESTLEIND.NS", name: "Nestle", sector: "FMCG" },
  { sym: "BRITANNIA.NS", name: "Britannia", sector: "FMCG" },
  { sym: "TATACONSUM.NS", name: "Tata Consumer", sector: "FMCG" },
  { sym: "TATASTEEL.NS", name: "Tata Steel", sector: "Metal" },
  { sym: "JSWSTEEL.NS", name: "JSW Steel", sector: "Metal" },
  { sym: "HINDALCO.NS", name: "Hindalco", sector: "Metal" },
  { sym: "VEDL.NS", name: "Vedanta", sector: "Metal" },
  { sym: "COALINDIA.NS", name: "Coal India", sector: "Metal" },
  { sym: "BAJFINANCE.NS", name: "Bajaj Finance", sector: "Fin Serv" },
  { sym: "BAJAJFINSV.NS", name: "Bajaj Finserv", sector: "Fin Serv" },
  { sym: "HDFCLIFE.NS", name: "HDFC Life", sector: "Fin Serv" },
  { sym: "SBILIFE.NS", name: "SBI Life", sector: "Fin Serv" },
  { sym: "LT.NS", name: "L&T", sector: "Infra" },
  { sym: "ADANIPORTS.NS", name: "Adani Ports", sector: "Infra" },
  { sym: "ULTRACEMCO.NS", name: "UltraTech", sector: "Infra" },
  { sym: "GRASIM.NS", name: "Grasim", sector: "Infra" },
  { sym: "DLF.NS", name: "DLF", sector: "Realty" },
  { sym: "BHARTIARTL.NS", name: "Bharti Airtel", sector: "Telecom" },
  { sym: "TITAN.NS", name: "Titan", sector: "Consumer" },
  { sym: "ASIANPAINT.NS", name: "Asian Paints", sector: "Consumer" },
  { sym: "TRENT.NS", name: "Trent", sector: "Consumer" },
];

/* --------------------------- sector indices ------------------------ */

const SECTOR_INDICES: { sym: string; name: string; key: string }[] = [
  { sym: "^NSEBANK", name: "Bank", key: "Bank" },
  { sym: "^CNXIT", name: "IT", key: "IT" },
  { sym: "^CNXAUTO", name: "Auto", key: "Auto" },
  { sym: "^CNXPHARMA", name: "Pharma", key: "Pharma" },
  { sym: "^CNXFMCG", name: "FMCG", key: "FMCG" },
  { sym: "^CNXMETAL", name: "Metal", key: "Metal" },
  { sym: "^CNXENERGY", name: "Energy", key: "Energy" },
  { sym: "NIFTY_FIN_SERVICE.NS", name: "Fin Services", key: "Fin Serv" },
  { sym: "^CNXPSUBANK", name: "PSU Bank", key: "PSU Bank" },
  { sym: "^CNXREALTY", name: "Realty", key: "Realty" },
  { sym: "^CNXMEDIA", name: "Media", key: "Media" },
  { sym: "^CNXINFRA", name: "Infra", key: "Infra" },
];

/* --------------------------- F&O server fn ------------------------- */

export const getFno = createServerFn({ method: "GET" }).handler(async () =>
  cached(
    "insights-fno",
    async () => {
  const metas = await fetchSpark(UNIVERSE.map((u) => u.sym)).catch(
    () => new Map<string, SparkMeta>(),
  );
  const movers: Mover[] = [];
  for (const u of UNIVERSE) {
    const m = metas.get(u.sym);
    if (!m) continue;
    const mv = toMover(m, u.name, u.sector);
    if (mv) movers.push(mv);
  }
  const sorted = [...movers].sort((a, b) => b.changePct - a.changePct);
  const bullish = sorted.slice(0, 5);
  const bearish = [...sorted].reverse().slice(0, 5);
  return { bullish, bearish, updatedAt: new Date().toISOString() };
    },
    { ttlMs: 30_000 },
  ),
);

/* -------------------------- sectors server fn ---------------------- */

export const getSectors = createServerFn({ method: "GET" }).handler(async () =>
  cached(
    "insights-sectors",
    async () => {
  const [idxMetas, stockMetas] = await Promise.all([
    fetchSpark(SECTOR_INDICES.map((s) => s.sym)).catch(
      () => new Map<string, SparkMeta>(),
    ),
    fetchSpark(UNIVERSE.map((u) => u.sym)).catch(
      () => new Map<string, SparkMeta>(),
    ),
  ]);

  // build stock movers grouped by sector key
  const bySector = new Map<string, Mover[]>();
  for (const u of UNIVERSE) {
    const m = stockMetas.get(u.sym);
    if (!m) continue;
    const mv = toMover(m, u.name, u.sector);
    if (!mv) continue;
    const arr = bySector.get(u.sector) ?? [];
    arr.push(mv);
    bySector.set(u.sector, arr);
  }

  const sectors: Sector[] = [];
  for (const s of SECTOR_INDICES) {
    const m = idxMetas.get(s.sym);
    if (!m) continue;
    const price = m.regularMarketPrice;
    const prev = m.chartPreviousClose;
    if (price == null || prev == null || prev === 0) continue;
    const change = price - prev;
    const members = (bySector.get(s.key) ?? []).sort(
      (a, b) => b.changePct - a.changePct,
    );
    sectors.push({
      symbol: s.sym,
      name: s.name,
      price: round2(price),
      change: round2(change),
      changePct: round2((change / prev) * 100),
      leaders: members,
    });
  }
  sectors.sort((a, b) => b.changePct - a.changePct);
  return { sectors, updatedAt: new Date().toISOString() };
    },
    { ttlMs: 30_000 },
  ),
);

/* ----------------------------- news fn ---------------------------- */

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

export const getNews = createServerFn({ method: "GET" }).handler(async () =>
  cached(
    "insights-news",
    async () => {
  const url =
    "https://news.google.com/rss/search?q=nifty+sensex+stock+market+when:1d&hl=en-IN&gl=IN&ceid=IN:en";
  const xml = await fetchTextSafe(url, {
    accept: "application/rss+xml, application/xml, text/xml",
  });
  if (!xml) return { items: [] as NewsItem[], updatedAt: new Date().toISOString() };
  const items: NewsItem[] = [];
  const blocks = xml.split("<item>").slice(1);
  for (const b of blocks.slice(0, 8)) {
    const rawTitle = /<title>(.*?)<\/title>/s.exec(b)?.[1] ?? "";
    const link = /<link>(.*?)<\/link>/s.exec(b)?.[1] ?? "";
    const pub = /<pubDate>(.*?)<\/pubDate>/s.exec(b)?.[1] ?? "";
    const source = /<source[^>]*>(.*?)<\/source>/s.exec(b)?.[1] ?? "Google News";
    let title = decode(rawTitle);
    // Google News titles are "Headline - Source"
    title = title.replace(/\s-\s[^-]*$/, (m) => m).trim();
    let time = "";
    if (pub) {
      const d = new Date(pub);
      if (!isNaN(d.getTime())) {
        time = d.toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Kolkata",
        });
      }
    }
    if (title) items.push({ title, source: decode(source), link: decode(link), time });
  }
  return { items, updatedAt: new Date().toISOString() };
    },
    { ttlMs: 60_000 },
  ),
);
