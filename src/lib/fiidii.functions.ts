import { createServerFn } from "@tanstack/react-start";
import { fetchJson, fetchTextSafe } from "./http";

export type FiiDiiRow = {
  date: string; // ISO yyyy-mm-dd for sorting
  label: string; // display date e.g. 03 Jul
  fiiCash: number; // FII cash net (₹ cr)
  diiCash: number; // DII cash net (₹ cr)
  fiiFuture: number; // FII index + stock futures net (₹ cr / contracts net)
};

type RawRow = {
  date?: string;
  fii_net?: number;
  dii_net?: number;
  fii_idx_fut_net?: number;
  fii_stk_fut_net?: number;
};

const MONTHS: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

/** Parse "03-Jul-2026" -> { iso, label } */
function parseDate(raw: string): { iso: string; label: string } {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(raw.trim());
  if (!m) return { iso: raw, label: raw };
  const [, d, mon, y] = m;
  const mm = MONTHS[mon] ?? "01";
  const dd = d.padStart(2, "0");
  return { iso: `${y}-${mm}-${dd}`, label: `${dd} ${mon}` };
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** ISO yyyy-mm-dd -> DDMMYYYY (NSE archive filename format). */
function toNseDate(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${d}${mo}${y}`;
}

/**
 * Fetch NSE participant-wise OI for a date and return FII net futures
 * (index + stock) in number of contracts. Returns null when unavailable
 * (weekend/holiday/404). CSV FII row columns:
 * 0=ClientType,1=FutIdxLong,2=FutIdxShort,3=FutStkLong,4=FutStkShort,...
 */
async function fetchFiiFutureNet(iso: string): Promise<number | null> {
  const d = toNseDate(iso);
  if (!d) return null;
  const url = `https://nsearchives.nseindia.com/content/nsccl/fao_participant_oi_${d}.csv`;
  const text = await fetchTextSafe(url, { timeoutMs: 8000, accept: "text/csv, */*" });
  if (!text || !text.includes("Participant wise Open Interest")) return null;
  const line = text
    .split(/\r?\n/)
    .find((l) => /^FII\s*,/i.test(l.trim()));
  if (!line) return null;
  const c = line.split(",").map((x) => Number(x.trim()));
  const futIdxLong = num(c[1]);
  const futIdxShort = num(c[2]);
  const futStkLong = num(c[3]);
  const futStkShort = num(c[4]);
  if (![c[1], c[2], c[3], c[4]].every((n) => Number.isFinite(n))) return null;
  return futIdxLong - futIdxShort + (futStkLong - futStkShort);
}

export const getFiiDii = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ rows: FiiDiiRow[]; fetchedAt: string }> => {
    let raw: RawRow[] = [];
    try {
      raw = await fetchJson<RawRow[]>("https://fii-diidata.mrchartist.com/api/history", {
        timeoutMs: 9000,
      });
    } catch {
      raw = [];
    }
    const rows: FiiDiiRow[] = raw
      .filter((r) => r.date)
      .map((r) => {
        const { iso, label } = parseDate(r.date!);
        return {
          date: iso,
          label,
          fiiCash: num(r.fii_net),
          diiCash: num(r.dii_net),
          fiiFuture: num(r.fii_idx_fut_net) + num(r.fii_stk_fut_net),
        };
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 12);

    // Enrich FII futures net from NSE participant-wise OI when the primary
    // source doesn't populate it (its futures fields are all zeros).
    await Promise.all(
      rows.map(async (row) => {
        if (row.fiiFuture !== 0) return;
        const net = await fetchFiiFutureNet(row.date);
        if (net !== null) row.fiiFuture = net;
      }),
    );

    return { rows, fetchedAt: new Date().toISOString() };
  },
);