import { createServerFn } from "@tanstack/react-start";
import { fetchTextSafe } from "./http";

export type NewsItem = {
  title: string;
  link: string;
  source: string;
  pubDate: string; // ISO
  category: "MARKET" | "BTC" | "GOLD" | "SILVER";
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

export const getMarketNews = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ items: NewsItem[]; fetchedAt: string }> => {
    const results = await Promise.all(
      FEEDS.map((f) => fetchFeed(f.category, f.query).catch(() => [])),
    );
    const seen = new Set<string>();
    const items = results
      .flat()
      .filter((it) => {
        if (!it.title || seen.has(it.title)) return false;
        seen.add(it.title);
        return true;
      })
      .sort((a, b) => +new Date(b.pubDate) - +new Date(a.pubDate))
      .slice(0, 30);
    return { items, fetchedAt: new Date().toISOString() };
  },
);
