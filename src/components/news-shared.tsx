import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ExternalLink,
  Check,
  Bookmark,
  BookmarkCheck,
  TrendingUp,
  TrendingDown,
  Activity,
  Minus,
  Zap,
} from "lucide-react";
import type {
  RichNewsItem,
  NewsImpact,
  NewsCategory,
  AiStance,
} from "@/lib/news-feed.functions";

export const READ_KEY = "eb-news-read";
export const SAVE_KEY = "eb-news-saved";
export const PREFS_KEY = "eb-news-prefs";
export const AUTO_KEY = "eb-news-auto-open";
export const BREAKING_SEEN_KEY = "eb-news-breaking-seen";

export const IMPACT_COLOR: Record<NewsImpact, string> = {
  Bullish: "var(--eb-bull)",
  Bearish: "var(--eb-bear)",
  "High Volatility": "var(--eb-accent)",
  Important: "var(--eb-blue, #38bdf8)",
  General: "var(--eb-muted)",
};

export const ALL_CATEGORIES: NewsCategory[] = [
  "NIFTY", "BANKNIFTY", "Equity", "Options", "FII/DII",
  "Global Markets", "Commodities", "RBI", "SEBI", "IPO", "Economy", "Corporate Results",
];

export const CATEGORIES: (NewsCategory | "All")[] = ["All", ...ALL_CATEGORIES];

const STANCE_META: Record<AiStance, { color: string; Icon: React.ComponentType<{ size?: number }> }> = {
  Bull: { color: "var(--eb-bull)", Icon: TrendingUp },
  Bear: { color: "var(--eb-bear)", Icon: TrendingDown },
  Volatile: { color: "var(--eb-accent)", Icon: Activity },
  Neutral: { color: "var(--eb-muted)", Icon: Minus },
};

export function relTime(iso: string): string {
  const diff = Date.now() - +new Date(iso);
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function sourceHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

export function useLocalSet(key: string): [Set<string>, (id: string) => void] {
  const [set, setSet] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setSet(new Set(JSON.parse(raw)));
    } catch { /* ignore */ }
  }, [key]);
  const toggle = useCallback((id: string) => {
    setSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try { localStorage.setItem(key, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }, [key]);
  return [set, toggle];
}

/* ---------------------------- Preferences ---------------------------- */

export type NewsPrefs = { disabledCats: string[]; disabledSources: string[] };

export function useNewsPrefs() {
  const [prefs, setPrefs] = useState<NewsPrefs>({ disabledCats: [], disabledSources: [] });
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (raw) setPrefs({ disabledCats: [], disabledSources: [], ...JSON.parse(raw) });
    } catch { /* ignore */ }
  }, []);
  const persist = (next: NewsPrefs) => {
    setPrefs(next);
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };
  const toggleCat = (c: string) =>
    persist({
      ...prefs,
      disabledCats: prefs.disabledCats.includes(c)
        ? prefs.disabledCats.filter((x) => x !== c)
        : [...prefs.disabledCats, c],
    });
  const toggleSource = (s: string) =>
    persist({
      ...prefs,
      disabledSources: prefs.disabledSources.includes(s)
        ? prefs.disabledSources.filter((x) => x !== s)
        : [...prefs.disabledSources, s],
    });
  const reset = () => persist({ disabledCats: [], disabledSources: [] });
  return { prefs, toggleCat, toggleSource, reset };
}

export function applyPrefs(items: RichNewsItem[], prefs: NewsPrefs): RichNewsItem[] {
  return items.filter(
    (n) => !prefs.disabledCats.includes(n.category) && !prefs.disabledSources.includes(n.source),
  );
}

export function filterNews(
  items: RichNewsItem[],
  opts: { query: string; cat: NewsCategory | "All"; prefs: NewsPrefs },
): RichNewsItem[] {
  const term = opts.query.trim().toLowerCase();
  return applyPrefs(items, opts.prefs)
    .filter((n) => (opts.cat === "All" ? true : n.category === opts.cat))
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
}

/** Unread breaking items drive the persistent bell alert count. */
export function unreadBreaking(items: RichNewsItem[], read: Set<string>): RichNewsItem[] {
  return items.filter((n) => n.breaking && !read.has(n.id));
}

/* ------------------------------ News card ---------------------------- */

export function NewsCard({
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
  const stance = STANCE_META[n.ai.stance];
  const StanceIcon = stance.Icon;
  return (
    <motion.div
      className={`eb-news-card${n.breaking ? " is-breaking" : ""}`}
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: isRead ? 0.62 : 1, y: 0 }}
      style={{ borderLeft: `3px solid ${n.breaking ? "var(--eb-bear)" : color}` }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <span
          className="eb-src-logo"
          style={{ background: `linear-gradient(135deg, hsl(${hue} 70% 45%), hsl(${(hue + 40) % 360} 70% 35%))` }}
        >
          {(n.source || "M").slice(0, 1).toUpperCase()}
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="eb-src-name">
            {n.breaking ? <span className="eb-mini-breaking"><Zap size={10} /> BREAKING</span> : null}
            {n.source || "Markets"}
          </div>
          <div className="eb-src-meta">{relTime(n.pubDate)} · {n.category}</div>
        </div>
        <span className="eb-impact" style={{ marginLeft: "auto", color, borderColor: color }}>
          {n.impact}
        </span>
      </div>

      <div className="eb-news-headline">{n.title}</div>

      <div className="eb-ai-view">
        <div className="eb-ai-top">
          <span className="eb-ai-label">AI Market View</span>
          <span className="eb-ai-stance" style={{ color: stance.color, borderColor: stance.color }}>
            <StanceIcon size={12} /> {n.ai.stance}
          </span>
        </div>
        <div className="eb-ai-line"><b>Impact:</b> {n.ai.text}</div>
        <div className="eb-ai-line"><b>Levels:</b> {n.ai.level}</div>
        <div className="eb-ai-line"><b>Sector:</b> {n.ai.sector}</div>
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

/* ---------------------------- Settings modal ------------------------- */

export function NewsSettings({
  sources, prefs, onToggleCat, onToggleSource, onReset, onClose,
}: {
  sources: string[];
  prefs: NewsPrefs;
  onToggleCat: (c: string) => void;
  onToggleSource: (s: string) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  return (
    <div className="eb-news-overlay" style={{ zIndex: 1300 }} onClick={onClose}>
      <motion.div
        className="eb-news-modal eb-glass"
        style={{ width: 560 }}
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ type: "spring", stiffness: 260, damping: 24 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="News settings"
      >
        <div className="eb-news-head">
          <div className="eb-news-title">News Settings</div>
          <button className="eb-icon-btn" onClick={onClose} aria-label="Close settings">✕</button>
        </div>
        <div className="eb-news-body">
          <div className="eb-settings-section">Categories</div>
          <div className="eb-toggle-grid">
            {ALL_CATEGORIES.map((c) => {
              const on = !prefs.disabledCats.includes(c);
              return (
                <button key={c} className={`eb-toggle${on ? " is-on" : ""}`} onClick={() => onToggleCat(c)}>
                  <span className="eb-toggle-dot" /> {c}
                </button>
              );
            })}
          </div>
          <div className="eb-settings-section" style={{ marginTop: 14 }}>Sources</div>
          {sources.length === 0 ? (
            <p className="eb-news-summary">Sources appear here after news loads.</p>
          ) : (
            <div className="eb-toggle-grid">
              {sources.map((s) => {
                const on = !prefs.disabledSources.includes(s);
                return (
                  <button key={s} className={`eb-toggle${on ? " is-on" : ""}`} onClick={() => onToggleSource(s)}>
                    <span className="eb-toggle-dot" /> {s}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="eb-news-foot">
          <button className="eb-foot-btn" onClick={onReset}>Reset</button>
          <button className="eb-foot-btn eb-foot-primary" onClick={onClose}>Done</button>
        </div>
      </motion.div>
    </div>
  );
}
