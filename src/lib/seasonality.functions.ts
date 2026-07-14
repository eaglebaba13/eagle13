import { createServerFn } from "@tanstack/react-start";
import { fetchJson } from "./http";
import { cached } from "./server-cache";
import { YahooChartSchema, parseProvider } from "./providers";

export type SeasonRow = {
  year: number;
  months: (number | null)[]; // length 12, Jan..Dec, monthly % change
};

export type SeasonalityData = {
  years: SeasonRow[]; // newest first
  avg: (number | null)[]; // length 12, average % per month
  fetchedAt: string;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export const getSeasonality = createServerFn({ method: "GET" }).handler(
  async (): Promise<SeasonalityData> =>
    cached<SeasonalityData>(
      "seasonality",
      async () => {
    const url =
      "https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI?range=15y&interval=1mo";
    let r: import("./providers").YahooChartResult | undefined;
    try {
      const json = parseProvider(YahooChartSchema, await fetchJson<unknown>(url, { timeoutMs: 9000 }), "Yahoo (^NSEI)");
      r = json.chart.result?.[0];
    } catch {
      return { years: [], avg: Array(12).fill(null), fetchedAt: new Date().toISOString() };
    }
    const ts: number[] = r?.timestamp ?? [];
    const quote = r?.indicators?.quote?.[0] ?? {};
    const opens: (number | null)[] = quote.open ?? [];
    const closes: (number | null)[] = quote.close ?? [];

    // Map year -> [12] monthly % change (open->close of that calendar month)
    const byYear = new Map<number, (number | null)[]>();
    for (let i = 0; i < ts.length; i++) {
      const o = opens[i];
      const c = closes[i];
      if (o == null || c == null || o === 0) continue;
      const d = new Date(ts[i] * 1000);
      const y = d.getUTCFullYear();
      const m = d.getUTCMonth(); // 0..11
      if (!byYear.has(y)) byYear.set(y, Array(12).fill(null));
      byYear.get(y)![m] = round1(((c - o) / o) * 100);
    }

    const years: SeasonRow[] = [...byYear.entries()]
      .map(([year, months]) => ({ year, months }))
      .sort((a, b) => b.year - a.year);

    // Average per month across all years with data.
    const avg: (number | null)[] = Array(12).fill(null);
    for (let m = 0; m < 12; m++) {
      const vals = years
        .map((y) => y.months[m])
        .filter((v): v is number => v != null);
      avg[m] = vals.length ? round1(vals.reduce((s, v) => s + v, 0) / vals.length) : null;
    }

    return { years, avg, fetchedAt: new Date().toISOString() };
      },
      { ttlMs: 15 * 60_000 },
    ),
);