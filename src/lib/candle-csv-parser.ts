// Phase 21.2 · Stage 5.1 — provider-agnostic 5-minute candle CSV parser.
// Pure, deterministic. No network, no filesystem. Rejects rows rather than
// guessing. Every parse requires an explicit exchange timezone, instrument,
// and provider label — never inferred.

export type ProviderLabel =
  | "TradingView"
  | "Zerodha"
  | "Upstox"
  | "Dhan"
  | "AngelOne"
  | "NSE"
  | "Generic";

export type ParsedCandle = {
  timeIst: string; // ISO with +05:30 offset
  openTimeMs: number; // epoch millis of candle open
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

export type RejectedRow = {
  rowIndex: number; // 1-based row within CSV body (excluding header)
  raw: string;
  reason: string;
};

export type ParseWarning = { rowIndex: number; message: string };

export type ParseArgs = {
  csv: string;
  provider: ProviderLabel;
  instrument: string;
  timezone: "Asia/Kolkata" | "UTC"; // must be explicit
  interval: "5m"; // must be explicit; other intervals rejected
};

export type ParseResult = {
  provider: ProviderLabel;
  instrument: string;
  timezone: ParseArgs["timezone"];
  interval: "5m";
  rows: ParsedCandle[];
  rejected: RejectedRow[];
  warnings: ParseWarning[];
};

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function toIstIso(epochMs: number): string {
  const d = new Date(epochMs + IST_OFFSET_MS);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  const s = String(d.getUTCSeconds()).padStart(2, "0");
  return `${y}-${mo}-${da}T${h}:${mi}:${s}+05:30`;
}

/**
 * Parse a timestamp string into epoch millis.
 * Requires explicit source timezone — never silently guesses.
 * Supports: ISO 8601 with offset, "YYYY-MM-DD HH:mm[:ss]", "DD-MM-YYYY HH:mm[:ss]",
 * numeric epoch (seconds or milliseconds).
 */
export function parseTimestamp(
  raw: string,
  tz: "Asia/Kolkata" | "UTC",
): number | null {
  const s = raw.trim();
  if (!s) return null;

  // Numeric epoch
  if (/^\d{10}$/.test(s)) return parseInt(s, 10) * 1000;
  if (/^\d{13}$/.test(s)) return parseInt(s, 10);

  // ISO with explicit offset (highest priority — carries its own timezone)
  const isoWithTz = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;
  if (isoWithTz.test(s)) {
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : null;
  }

  // Naive "YYYY-MM-DD HH:mm[:ss]" or "YYYY-MM-DDTHH:mm[:ss]"
  const naiveIso = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;
  const m1 = naiveIso.exec(s);
  if (m1) {
    const [, y, mo, da, h, mi, se] = m1;
    const utcMs = Date.UTC(+y, +mo - 1, +da, +h, +mi, se ? +se : 0);
    return tz === "Asia/Kolkata" ? utcMs - IST_OFFSET_MS : utcMs;
  }

  // "DD-MM-YYYY HH:mm[:ss]" (Zerodha default export)
  const dmy = /^(\d{2})-(\d{2})-(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;
  const m2 = dmy.exec(s);
  if (m2) {
    const [, da, mo, y, h, mi, se] = m2;
    const utcMs = Date.UTC(+y, +mo - 1, +da, +h, +mi, se ? +se : 0);
    return tz === "Asia/Kolkata" ? utcMs - IST_OFFSET_MS : utcMs;
  }

  return null;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const HEADER_ALIASES: Record<keyof ParsedCandle | "timestamp", string[]> = {
  timestamp: [
    "timestamp",
    "time",
    "date",
    "datetime",
    "date/time",
    "date_time",
    "candle_time",
  ],
  open: ["open", "o"],
  high: ["high", "h"],
  low: ["low", "l"],
  close: ["close", "c", "last", "ltp"],
  volume: ["volume", "vol", "v", "qty"],
  timeIst: [],
  openTimeMs: [],
};

function detectColumn(header: string[], aliases: string[]): number {
  const lower = header.map((h) => h.toLowerCase());
  for (const a of aliases) {
    const idx = lower.indexOf(a);
    if (idx >= 0) return idx;
  }
  return -1;
}

export function parseCandleCsv(args: ParseArgs): ParseResult {
  if (args.interval !== "5m") {
    throw new Error("Only 5m interval is supported");
  }
  if (args.timezone !== "Asia/Kolkata" && args.timezone !== "UTC") {
    throw new Error("Timezone must be explicit: Asia/Kolkata or UTC");
  }

  const lines = args.csv
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0 && !l.startsWith("#"));
  if (lines.length < 2) {
    return {
      provider: args.provider,
      instrument: args.instrument,
      timezone: args.timezone,
      interval: "5m",
      rows: [],
      rejected: [],
      warnings: [{ rowIndex: 0, message: "Empty CSV or missing rows" }],
    };
  }

  const header = splitCsvLine(lines[0]);
  const iTs = detectColumn(header, HEADER_ALIASES.timestamp);
  const iO = detectColumn(header, HEADER_ALIASES.open);
  const iH = detectColumn(header, HEADER_ALIASES.high);
  const iL = detectColumn(header, HEADER_ALIASES.low);
  const iC = detectColumn(header, HEADER_ALIASES.close);
  const iV = detectColumn(header, HEADER_ALIASES.volume);

  if (iTs < 0 || iO < 0 || iH < 0 || iL < 0 || iC < 0) {
    throw new Error(
      `CSV missing required columns (need timestamp/open/high/low/close). Got: ${header.join(",")}`,
    );
  }

  const rows: ParsedCandle[] = [];
  const rejected: RejectedRow[] = [];
  const warnings: ParseWarning[] = [];
  const seen = new Set<number>();

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    const parts = splitCsvLine(raw);
    const rowIndex = i;
    const tsRaw = parts[iTs] ?? "";
    const ts = parseTimestamp(tsRaw, args.timezone);
    if (ts == null) {
      rejected.push({ rowIndex, raw, reason: `Unparseable timestamp: ${tsRaw}` });
      continue;
    }
    if (ts > Date.now() + 60_000) {
      rejected.push({ rowIndex, raw, reason: "Future timestamp" });
      continue;
    }
    const o = Number(parts[iO]);
    const h = Number(parts[iH]);
    const l = Number(parts[iL]);
    const c = Number(parts[iC]);
    const v = iV >= 0 ? Number(parts[iV]) : null;
    if (![o, h, l, c].every((n) => Number.isFinite(n) && n > 0)) {
      rejected.push({ rowIndex, raw, reason: "Non-numeric OHLC" });
      continue;
    }
    if (l > h || o < l || o > h || c < l || c > h) {
      rejected.push({ rowIndex, raw, reason: "OHLC inconsistency" });
      continue;
    }
    if (seen.has(ts)) {
      rejected.push({ rowIndex, raw, reason: "Duplicate timestamp" });
      continue;
    }
    if (ts % (60 * 1000) !== 0) {
      warnings.push({ rowIndex, message: "Timestamp not aligned to minute" });
    }
    seen.add(ts);
    rows.push({
      timeIst: toIstIso(ts),
      openTimeMs: ts,
      open: o,
      high: h,
      low: l,
      close: c,
      volume: v != null && Number.isFinite(v) ? v : null,
    });
  }

  rows.sort((a, b) => a.openTimeMs - b.openTimeMs);
  return {
    provider: args.provider,
    instrument: args.instrument,
    timezone: args.timezone,
    interval: "5m",
    rows,
    rejected,
    warnings,
  };
}