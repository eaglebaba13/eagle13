import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  X,
  RefreshCw,
  Search,
  ExternalLink,
  Check,
  Bookmark,
  BookmarkCheck,
  Zap,
  AlertTriangle,
  WifiOff,
} from "lucide-react";
import {
  getMarketNewsFeed,
  type RichNewsItem,
  type NewsImpact,
  type NewsCategory,
} from "@/lib/news-feed.functions";

const AUTO_KEY = "eb-news-auto-open";
const READ_KEY = "eb-news-read";
const SAVE_KEY = "eb-news-saved";

const IMPACT_COLOR: Record<NewsImpact, string> = {
  Bullish: "var(--eb-bull)",
  Bearish: "var(--eb-bear)",
  "High Volatility": "var(--eb-accent)",
  Important: "var(--eb-blue, #38bdf8)",
  General: "var(--eb-muted)",
};

const CATEGORIES: (NewsCategory | "All")[] = [
  "All", "NIFTY", "BANKNIFTY", "Equity", "Options", "FII/DII",
  "Global Markets", "Commodities", "RBI", "SEBI", "IPO", "Economy", "Corporate Results",
];

function relTime(iso: string): string {
  const diff = Date.now() - +new Date(iso);
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function sourceHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

function useLocalSet(key: string): [Set<string>, (id: string) => void] {
  const [set, setSet] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setSet(new Set(JSON.parse(raw)));
    } catch { /* ignore */ }
  }, [key]);
  const toggle = (id: string) => {
    setSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try { localStorage.setItem(key, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };
  return [set, toggle];
}

export function NewsCenter() {
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<NewsCategory | "All">("All");
  const [read, toggleRead] = useLocalSet(READ_KEY);
  const [saved, toggleSaved] = useLocalSet(SAVE_KEY);

  // Auto-open once per day.
  useEffect(() => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      if (localStorage.getItem(AUTO_KEY) !== today) {
        localStorage.setItem(AUTO_KEY, today);
        setOpen(true);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (open) setHasOpened(true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const q = useQuery({
    queryKey: ["market-news-feed"],
    queryFn: () => getMarketNewsFeed(),
    enabled: hasOpened,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    retry: 1,
  });

  const items = q.data?.items ?? [];
  const unread = items.filter((n) => !read.has(n.id)).length;

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return items
      .filter((n) => (cat === "All" ? true : n.category === cat))
      .filter((n) =>
        term
          ? n.title.toLowerCase().includes(term) ||
            n.source.toLowerCase().includes(term) ||
            n.summary.toLowerCase().includes(term)
          : true,
      )
      .sort((a, b) => {
        if (a.breaking !== b.breaking) return a.breaking ? -1 : 1;
        return +new Date(b.pubDate) - +new Date(a.pubDate);
      });
  }, [items, query, cat]);

  const breaking = items.filter((n) => n.breaking);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="eb-news-bell"
        aria-label="Open latest market news"
        title="Latest Market News"
      >
        <Bell size={18} />
        {unread > 0 ? <span className="eb-news-badge">{unread > 9 ? "9+" : unread}</span> : null}
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            className="eb-news-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setOpen(false)}
          >
            <motion.div
              className="eb-news-modal eb-glass"
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ type: "spring", stiffness: 260, damping: 24 }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Latest Market News"
            >
              {/* Header */}
              <div className="eb-news-head">
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <span className="eb-live-dot" aria-hidden />
                  <div style={{ minWidth: 0 }}>
                    <div className="eb-news-title">Latest Market News</div>
                    <div className="eb-news-sub">
                      {q.isFetching ? "Updating…" : q.data
                        ? `Last updated ${relTime(q.data.fetchedAt)}`
                        : "Live financial headlines"}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="eb-icon-btn" onClick={() => q.refetch()} aria-label="Refresh" title="Refresh">
                    <RefreshCw size={16} className={q.isFetching ? "eb-spin" : undefined} />
                  </button>
                  <button className="eb-icon-btn" onClick={() => setOpen(false)} aria-label="Close" title="Close">
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Breaking banner */}
              {breaking.length > 0 ? (
                <motion.div
                  className="eb-breaking"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <Zap size={14} />
                  <span className="eb-breaking-tag">BREAKING</span>
                  <span className="eb-breaking-text">{breaking[0].title}</span>
                </motion.div>
              ) : null}

              {/* Controls */}
              <div className="eb-news-controls">
                <div className="eb-news-search">
                  <Search size={15} color="var(--eb-muted)" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search news, source or keyword…"
                    aria-label="Search news"
                  />
                </div>
                <div className="eb-news-cats">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c}
                      className={`eb-cat-chip${cat === c ? " is-active" : ""}`}
                      onClick={() => setCat(c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* Body */}
              <div className="eb-news-body">
                {q.isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="eb-news-card">
                      <div className="eb-skel" style={{ height: 14, width: "70%" }} />
                      <div className="eb-skel" style={{ height: 10, width: "40%" }} />
                      <div className="eb-skel" style={{ height: 32, width: "100%" }} />
                    </div>
                  ))
                ) : q.isError ? (
                  <div className="eb-news-empty">
                    <WifiOff size={30} color="var(--eb-muted)" />
                    <p>No latest news available. Please try again later.</p>
                    <button className="eb-foot-btn" onClick={() => q.refetch()}>Retry</button>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="eb-news-empty">
                    <AlertTriangle size={28} color="var(--eb-muted)" />
                    <p>No matching news right now.</p>
                  </div>
                ) : (
                  filtered.map((n) => (
                    <NewsCard
                      key={n.id}
                      n={n}
                      isRead={read.has(n.id)}
                      isSaved={saved.has(n.id)}
                      onRead={() => toggleRead(n.id)}
                      onSave={() => toggleSaved(n.id)}
                    />
                  ))
                )}
              </div>

              {/* Footer */}
              <div className="eb-news-foot">
                <a
                  className="eb-foot-btn"
                  href="https://news.google.com/search?q=indian%20stock%20market&hl=en-IN"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View All News
                </a>
                <button className="eb-foot-btn" onClick={() => q.refetch()}>Refresh</button>
                <button className="eb-foot-btn eb-foot-primary" onClick={() => setOpen(false)}>Close</button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

function NewsCard({
  n, isRead, isSaved, onRead, onSave,
}: {
  n: RichNewsItem;
  isRead: boolean;
  isSaved: boolean;
  onRead: () => void;
  onSave: () => void;
}) {
  const color = IMPACT_COLOR[n.impact];
  const hue = sourceHue(n.source || n.category);
  return (
    <motion.div
      className="eb-news-card"
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: isRead ? 0.62 : 1, y: 0 }}
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <span
          className="eb-src-logo"
          style={{ background: `linear-gradient(135deg, hsl(${hue} 70% 45%), hsl(${(hue + 40) % 360} 70% 35%))` }}
        >
          {(n.source || "M").slice(0, 1).toUpperCase()}
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="eb-src-name">{n.source || "Markets"}</div>
          <div className="eb-src-meta">{relTime(n.pubDate)} · {n.category}</div>
        </div>
        <span className="eb-impact" style={{ marginLeft: "auto", color, borderColor: color }}>
          {n.breaking ? "● " : ""}{n.impact}
        </span>
      </div>

      <div className="eb-news-headline">{n.title}</div>

      <div className="eb-ai-view">
        <span className="eb-ai-label">AI Market View</span>
        <span>{n.aiView}</span>
      </div>

      <p className="eb-news-summary">{n.summary}</p>

      <div className="eb-news-actions">
        <a className="eb-card-btn" href={n.link} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={13} /> Read More
        </a>
        <button className={`eb-card-btn${isRead ? " is-on" : ""}`} onClick={onRead}>
          <Check size={13} /> {isRead ? "Read" : "Mark as read"}
        </button>
        <button className={`eb-card-btn${isSaved ? " is-on" : ""}`} onClick={onSave}>
          {isSaved ? <BookmarkCheck size={13} /> : <Bookmark size={13} />} {isSaved ? "Saved" : "Save"}
        </button>
      </div>
    </motion.div>
  );
}
