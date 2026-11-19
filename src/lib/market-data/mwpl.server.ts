const IST = "Asia/Kolkata";

export function nseTradeDay(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST, day: "2-digit", month: "short", year: "numeric",
  }).formatToParts(now);
  return ["day", "month", "year"].map((key) => parts.find((part) => part.type === key)?.value).join("-").toUpperCase();
}

export function parseCombinedOi(csv: string, tradeDay: string) {
  const rows = new Map<string, number>();
  const numeric = (value: string) => /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : NaN;
  for (const line of csv.split(/\r?\n/)) {
    const [date, isin, , symbol, limit, oi] = (line.match(/"(?:[^"]|"")*"|[^,]+|(?<=,)(?=,)/g) ?? [])
      .map((field) => field.trim().replace(/^"|"$/g, "").trim());
    const normalizedDate = date?.toUpperCase().replace(/^(\d)-/, "0$1-");
    if (normalizedDate !== tradeDay || !/^IN[A-Z0-9]{10}$/.test(isin ?? "") || !/^[A-Z0-9&-]+$/.test(symbol ?? "")) continue;
    const mwpl = numeric(limit ?? "");
    const interest = numeric(oi ?? "");
    if (Number.isFinite(mwpl) && mwpl > 0 && Number.isFinite(interest)) rows.set(symbol, interest / mwpl * 100);
  }
  return rows;
}

export async function fetchCombinedOi(now: Date) {
  const tradeDay = nseTradeDay(now);
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: IST, day: "2-digit", month: "2-digit", year: "numeric" }).format(now);
  try {
    const response = await fetch(`https://nsearchives.nseindia.com/content/fo/combineoi_${date.replaceAll("/", "")}.csv`, {
      signal: AbortSignal.timeout(6000),
    });
    if (response.ok) return parseCombinedOi(await response.text(), tradeDay);
  } catch {
    // A missing exchange report never clears a symbol for alert delivery.
  }
  return new Map<string, number>();
}
