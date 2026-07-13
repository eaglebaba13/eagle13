import { createServerFn } from "@tanstack/react-start";
import { fetchTextSafe } from "./http";
import { fetchFallback, FALLBACK_MARKET_FEEDS, FALLBACK_CRYPTO_FEEDS, type RawRssItem } from "./rss";

export type NewsItem = {
  title: string;
  link: string;
  source: string;
  pubDate: string; // ISO
  category: "MARKET" | "BTC" | "GOLD" | "SILVER";
};

export type NewsDiagnostics = {
  provider: string; // which source actually supplied the items
  count: number;
  degraded: boolean; // true when the primary provider failed and a fallback was used
  error: string | null;
};

export type NewsResult = {
  items: NewsItem[];
  fetchedAt: string;
  diagnostics: NewsDiagnostics;
};

const FEEDS: { category: NewsItem["category"]; query: string }[] = [
  { category: "MARKET", query: "nifty sensex indian stock market" },
  { category: "BTC", query: "bitcoin crypto price" },
  { category: "GOLD", query: "gold price XAU" },
  { category: "SILVER", query: "silver price XAG" },
];

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function pick(tag: string, block: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? decodeEntities(m[1]) : "";
}

async function fetchFeed(
  category: NewsItem["category"],
  query: string,
): Promise<NewsItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(
    query + " when:2d",
  )}&hl=en-IN&gl=IN&ceid=IN:en`;
  const xml = await fetchTextSafe(url, {
    accept: "application/rss+xml, application/xml, text/xml",
  });
  if (!xml) return [];
  const items = xml.split("<item>").slice(1);
  return items.slice(0, 8).map((raw) => {
    const block = raw.split("</item>")[0];
    const rawTitle = pick("title", block);
    const parts = rawTitle.split(" - ");
    const source = pick("source", block) || (parts.length > 1 ? parts.pop()! : "");
    const title = parts.length > 1 ? parts.join(" - ") : rawTitle;
    const pd = pick("pubDate", block);
    let iso = new Date().toISOString();
    if (pd) {
      const d = new Date(pd);
      if (!Number.isNaN(d.getTime())) iso = d.toISOString();
    }
    const cleanTitle = title || rawTitle;
    // Google News RSS <link> is a news.google.com redirect wrapper that many
    // browsers reject with ERR_BLOCKED_BY_RESPONSE. Link to a normal Google
    // search for the headline instead, which reliably reaches the article.
    const searchLink = `https://www.google.com/search?q=${encodeURIComponent(
      source ? `${cleanTitle} ${source}` : cleanTitle,
    )}`;
    return {
      title: cleanTitle,
      link: searchLink,
      source,
      pubDate: iso,
      category,
    };
  });
}

function dedupeSort(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  return items
    .filter((it) => {
      const key = it.title.toLowerCase();
      if (!it.title || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => +new Date(b.pubDate) - +new Date(a.pubDate))
    .slice(0, 30);
}

function categorize(title: string): NewsItem["category"] {
  const t = title.toLowerCase();
  if (/\b(bitcoin|btc|crypto|ethereum|eth|solana|blockchain)\b/.test(t)) return "BTC";
  if (/\b(gold|xau|bullion)\b/.test(t)) return "GOLD";
  if (/\b(silver|xag)\b/.test(t)) return "SILVER";
  return "MARKET";
}

function toNewsItems(raw: RawRssItem[]): NewsItem[] {
  return raw.map((r) => ({
    title: r.title,
    link: r.link || `https://www.google.com/search?q=${encodeURIComponent(r.title)}`,
    source: r.source,
    pubDate: r.pubDate,
    category: categorize(r.title),
  }));
}

export const getMarketNews = createServerFn({ method: "GET" }).handler(
  async (): Promise<NewsResult> => {
    const fetchedAt = new Date().toISOString();

    // 1) Primary provider: Google News RSS (reachable from the preview sandbox).
    let primaryError: string | null = null;
    try {
      const results = await Promise.all(
        FEEDS.map((f) => fetchFeed(f.category, f.query).catch(() => [])),
      );
      const items = dedupeSort(results.flat());
      if (items.length > 0) {
        return {
          items,
          fetchedAt,
          diagnostics: { provider: "Google News", count: items.length, degraded: false, error: null },
        };
      }
      primaryError = "Primary provider returned no items";
    } catch (err) {
      primaryError = err instanceof Error ? err.message : String(err);
    }

    // 2) Fallback providers (reachable from the Cloudflare Worker in production).
    try {
      const [market, crypto] = await Promise.all([
        fetchFallback(FALLBACK_MARKET_FEEDS),
        fetchFallback(FALLBACK_CRYPTO_FEEDS),
      ]);
      const items = dedupeSort(toNewsItems([...market, ...crypto]));
      return {
        items,
        fetchedAt,
        diagnostics: {
          provider: items.length ? "Fallback (ET/Livemint/BusinessLine/CoinDesk)" : "None",
          count: items.length,
          degraded: true,
          error: items.length ? primaryError : "No news returned by provider.",
        },
      };
    } catch (err) {
      return {
        items: [],
        fetchedAt,
        diagnostics: {
          provider: "None",
          count: 0,
          degraded: true,
          error: err instanceof Error ? err.message : "No news returned by provider.",
        },
      };
    }
  },
);
