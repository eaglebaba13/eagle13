// Shared, Cloudflare-Worker-safe RSS helpers with multi-provider fallback.
// Google News RSS is reachable from the Lovable preview sandbox (full Node
// egress) but NOT from the published Cloudflare Worker egress — there it
// returns nothing, which is why "Latest Market News" worked in Preview but
// showed an empty list after Publish. These publisher RSS feeds (Economic
// Times, Livemint, BusinessLine, CoinDesk, Cointelegraph) respond from the
// Worker and act as automatic fallbacks.
import { fetchTextSafe } from "./http";

export type RawRssItem = {
  title: string;
  link: string;
  source: string;
  pubDate: string; // ISO
};

export type ProviderResult = {
  provider: string;
  ok: boolean;
  count: number;
  httpNote: string;
};

export function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pick(tag: string, block: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? decodeEntities(m[1]) : "";
}

function pickLink(block: string): string {
  // RSS <link>text</link> or Atom <link href="..."/>
  const t = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
  if (t && t[1].trim()) return decodeEntities(t[1]);
  const h = block.match(/<link[^>]*href="([^"]+)"/i);
  if (h) return h[1];
  const g = block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i);
  if (g && /^https?:\/\//i.test(g[1].trim())) return g[1].trim();
  return "";
}

/** Parse a standard RSS/Atom feed into raw items. Never throws. */
export async function parseFeed(
  url: string,
  source: string,
  max = 12,
): Promise<RawRssItem[]> {
  const xml = await fetchTextSafe(url, {
    accept: "application/rss+xml, application/xml, text/xml, */*",
    retries: 2,
    retryDelayMs: 400,
    exponential: true,
  });
  if (!xml) return [];
  const isAtom = /<entry[\s>]/i.test(xml) && !/<item[\s>]/i.test(xml);
  const chunks = isAtom ? xml.split("<entry").slice(1) : xml.split("<item").slice(1);
  const out: RawRssItem[] = [];
  for (const raw of chunks.slice(0, max)) {
    const block = raw.split(isAtom ? "</entry>" : "</item>")[0];
    const title = pick("title", block);
    if (!title) continue;
    const link = pickLink(block);
    const pd = pick("pubDate", block) || pick("published", block) || pick("updated", block) || pick("dc:date", block);
    let iso = new Date().toISOString();
    if (pd) {
      const d = new Date(pd);
      if (!Number.isNaN(d.getTime())) iso = d.toISOString();
    }
    out.push({ title, link, source, pubDate: iso });
  }
  return out;
}

// Worker-reachable fallback publisher feeds, grouped by broad topic.
export const FALLBACK_MARKET_FEEDS: { url: string; source: string }[] = [
  { url: "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms", source: "Economic Times" },
  { url: "https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms", source: "Economic Times" },
  { url: "https://www.livemint.com/rss/markets", source: "Livemint" },
  { url: "https://www.thehindubusinessline.com/markets/feeder/default.rss", source: "BusinessLine" },
];

export const FALLBACK_CRYPTO_FEEDS: { url: string; source: string }[] = [
  { url: "https://www.coindesk.com/arc/outboundfeeds/rss/", source: "CoinDesk" },
  { url: "https://cointelegraph.com/rss", source: "Cointelegraph" },
];

/** Fetch every fallback feed in a group and flatten. */
export async function fetchFallback(
  feeds: { url: string; source: string }[],
): Promise<RawRssItem[]> {
  const results = await Promise.all(
    feeds.map((f) => parseFeed(f.url, f.source).catch(() => [] as RawRssItem[])),
  );
  return results.flat();
}
