import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import OptionChainChart from "./OptionChainChart";
import { getOiDirectionScanner } from "@/lib/options/oi-direction-scanner.functions";
import {
  OI_SYMBOLS,
  formatOi,
  oiTimeline,
  pcrRegime,
  type OiInterval,
  type OiRow,
} from "@/lib/options/oi-direction-scanner";
import { downloadBlob } from "@/lib/download";

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour12: false });
const money = (n: number | null | undefined) =>
  n == null
    ? "—"
    : n.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const tone = (n: number | null) =>
  n == null || n === 0 ? "text-zinc-400" : n > 0 ? "text-emerald-400" : "text-rose-400";
const field =
  "border border-zinc-700 bg-[#111722] rounded px-3 py-2 text-xs text-zinc-200 focus-visible:outline-2 focus-visible:outline-amber-400";
const labels = {
  direction: "OI direction",
  price: "Price action",
  pcr: "PCR trend",
  buildup: "OI build-up",
  walls: "Support / resistance",
  vwap: "VWAP alignment",
  liquidity: "Sweep / straddle",
};

export function scannerCsv(timeline: ReturnType<typeof oiTimeline>) {
  const header = [
    "Time IST",
    "Source",
    "LTP",
    "Call OI change",
    "Put OI change",
    "OI difference",
    "Direction change",
    "Direction",
    "Net PCR",
    "Support",
    "Resistance",
    "Build-up",
    "View",
    "Score",
    "Coverage %",
  ];
  const values = timeline.map(({ timestamp, row: r }) =>
    r
      ? [
          clock(r.timestamp),
          r.source,
          r.spot,
          r.callChange,
          r.putChange,
          r.diff,
          r.momentum,
          r.direction,
          r.pcr,
          r.support,
          r.resistance,
          r.buildup,
          r.view,
          r.score,
          r.coverage,
        ]
      : [clock(timestamp), "GAP"],
  );
  return [header, ...values]
    .map((row) => row.map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(","))
    .join("\r\n");
}

export function OiDirectionScanner() {
  const [symbol, setSymbol] = useState<(typeof OI_SYMBOLS)[number]>("NIFTY");
  const [expiry, setExpiry] = useState<string>();
  const [interval, setInterval] = useState<OiInterval>(1);
  const [compact, setCompact] = useState(true);
  const query = useQuery({
    queryKey: ["oi-direction-scanner", symbol, expiry ?? "auto", interval],
    queryFn: () => getOiDirectionScanner({ data: { symbol, expiry, interval } }),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
  const data = query.data;
  const rows = data?.rows ?? [];
  const latest = rows.at(-1);
  const timeline = data ? oiTimeline(rows, data.now, interval) : [];
  const context = data?.context;
  const delta =
    latest?.spot != null && context?.previousClose != null
      ? latest.spot - context.previousClose
      : null;
  const stale = latest
    ? data!.now - Date.parse(latest.timestamp) > 120_000 || !data?.marketOpen
    : true;
  const atmIndex = latest?.strikes.findIndex((s) => s.strike === latest.atm) ?? -1;
  const focus = atmIndex >= 0 ? latest!.strikes.slice(Math.max(0, atmIndex - 1), atmIndex + 2) : [];
  const number = (n: number | null) => formatOi(n, compact);
  return (
    <section
      aria-label="EagleBABA OI Intelligence"
      className="bg-[#0a0e14] text-zinc-200 border border-zinc-800 rounded-md font-mono text-xs tabular-nums"
    >
      <header className="p-4 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-amber-400 tracking-widest text-[10px] mb-1">
            EAGLEBABA / DERIVATIVES INTELLIGENCE
          </p>
          <h1 className="text-lg font-semibold">OI Direction &amp; PCR Log</h1>
          <p className="text-zinc-500 mt-1">
            Research only · ±10 ATM strikes · OI changes versus previous close
          </p>
        </div>
        <span className={stale ? "text-amber-300" : "text-emerald-400"}>
          {query.isFetching ? "UPDATING" : stale ? "HISTORICAL / AWAITING DATA" : "LIVE CAPTURE"} ·{" "}
          {latest ? `${clock(latest.timestamp)} IST` : "—"}
        </span>
      </header>
      <div className="p-4 flex flex-wrap items-end gap-3 border-b border-zinc-800">
        <label className="grid gap-1 text-zinc-400">
          Underlying
          <select
            className={field}
            value={symbol}
            onChange={(e) => {
              setSymbol(e.target.value as typeof symbol);
              setExpiry(undefined);
            }}
          >
            <optgroup label="Indices">
              {OI_SYMBOLS.slice(0, 5).map((s) => (
                <option key={s} value={s}>
                  {s === "NIFTY" ? "NIFTY 50" : s === "BANKNIFTY" ? "BANK NIFTY" : s}
                </option>
              ))}
            </optgroup>
            <optgroup label="F&O stocks">
              {OI_SYMBOLS.slice(5).map((s) => (
                <option key={s}>{s}</option>
              ))}
            </optgroup>
          </select>
        </label>
        <label className="grid gap-1 text-zinc-400">
          Expiry
          <select
            value={expiry ?? ""}
            className={field}
            onChange={(e) => setExpiry(e.target.value || undefined)}
          >
            <option value="">Nearest available</option>
            {data?.expiries.map((e) => (
              <option key={e}>{e}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-zinc-400">
          Observation interval
          <select
            value={interval}
            className={field}
            onChange={(e) => setInterval(Number(e.target.value) as OiInterval)}
          >
            {[1, 3, 5, 15].map((n) => (
              <option key={n} value={n}>
                {n}m
              </option>
            ))}
          </select>
        </label>
        <button className={field} aria-pressed={compact} onClick={() => setCompact(!compact)}>
          {compact ? "Lakh / Crore" : "Full Indian numbers"}
        </button>
        <button className={field} onClick={() => void query.refetch()} disabled={query.isFetching}>
          Retry / Refresh
        </button>
        <button
          className={`${field} text-amber-300 ml-auto`}
          disabled={!rows.length}
          onClick={() =>
            downloadBlob(
              scannerCsv(timeline),
              `EagleBABA-OI-${symbol}-${data?.expiry}-${interval}m.csv`,
              "text/csv;charset=utf-8",
            )
          }
        >
          ↓ Export CSV
        </button>
      </div>
      {(query.isError || data?.error || data?.persistenceError) && (
        <p role="alert" className="m-4 p-3 border border-amber-900 text-amber-200">
          {query.isError ? "Scanner unavailable. Retry to reconnect." : data?.error}{" "}
          {data?.persistenceError}
        </p>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 border-b border-zinc-800">
        {[
          ["OPEN", money(context?.open)],
          ["HIGH", money(context?.high)],
          ["LOW", money(context?.low)],
          ["LTP", money(latest?.spot)],
          ["NET CHANGE", money(delta)],
          [
            "CHANGE %",
            delta != null && context?.previousClose
              ? `${((delta / context.previousClose) * 100).toFixed(2)}%`
              : "—",
          ],
          ["EXPIRY", data?.expiry ?? "—"],
          ["SPOT VWAP", money(context?.vwap)],
        ].map(([label, value]) => (
          <div key={label} className="p-3 border-r border-zinc-800">
            <p className="text-[10px] text-zinc-500 mb-2">{label}</p>
            <strong className="text-sm text-zinc-100">{value}</strong>
          </div>
        ))}
      </div>
      <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-3">
        {focus.length ? (
          focus.map((s) => {
            const total = (s.call.oi ?? 0) + (s.put.oi ?? 0);
            const pct = total > 0 ? ((s.call.oi ?? 0) / total) * 100 : 50;
            return (
              <article
                key={s.strike}
                className={`border p-3 rounded ${s.strike === latest?.atm ? "border-amber-700 bg-amber-950/10" : "border-zinc-800 bg-[#10151d]"}`}
              >
                <div className="flex justify-between mb-3">
                  <span className="text-rose-300">CALL OI</span>
                  <strong className="text-amber-300">
                    {money(s.strike)}{" "}
                    {s.strike === latest?.atm
                      ? "ATM"
                      : s.strike < latest!.atm!
                        ? "ATM − 1"
                        : "ATM + 1"}
                  </strong>
                  <span className="text-emerald-300">PUT OI</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>{number(s.call.oi)}</span>
                  <span>{number(s.put.oi)}</span>
                </div>
                <div
                  className="flex h-1.5 my-2 bg-zinc-700"
                  aria-label={`Call dominance ${pct.toFixed(1)} percent`}
                >
                  <div className="bg-rose-500/70" style={{ width: `${pct}%` }} />
                  <div className="bg-emerald-500/70 flex-1" />
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Δ {number(s.call.changeOi)}</span>
                  <span>Δ {number(s.put.changeOi)}</span>
                </div>
              </article>
            );
          })
        ) : (
          <p className="text-zinc-500 lg:col-span-3 py-4">
            {query.isPending
              ? "Loading verified option-chain observations…"
              : "No verified ATM observations for this session. Historical backfill may still be running."}
          </p>
        )}
      </div>
      <div className="mx-4 border border-zinc-800 rounded p-4 bg-[#10151d]">
        <div className="flex flex-wrap justify-between gap-3 mb-4">
          <div>
            <span className="text-amber-400">OI INTELLIGENCE SCORE</span>
            <strong className="text-2xl ml-4">
              {latest?.score ?? "—"}
              <span className="text-xs text-zinc-500"> / 100</span>
            </strong>
            <span className="ml-3 text-zinc-400">{latest?.view ?? "NEUTRAL"}</span>
          </div>
          <span className="text-teal-300">
            ATM STRADDLE {money(latest?.straddle)} · Input coverage {latest?.coverage ?? 0}%
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-4">
          {(latest?.pillars ?? []).map((p) => (
            <div key={p.key} title={p.reason}>
              <div className="text-zinc-400 text-[10px]">{labels[p.key]}</div>
              <div className="mt-2 mb-2">
                {p.points ?? "N/A"}
                <span className="text-zinc-500"> / {p.weight}</span>
              </div>
              <div className="bg-zinc-800 h-1">
                <div
                  className="bg-amber-500/80 h-1"
                  style={{ width: `${p.points == null ? 0 : (p.points / p.weight) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        <details className="mt-4 text-zinc-400">
          <summary className="cursor-pointer text-teal-300">
            Score methodology &amp; data provenance
          </summary>
          <p className="mt-2">
            Directional heuristic: 0 bearish, 50 neutral, 100 bullish; not a probability or trade
            instruction. Missing pillars contribute half-weight and reduce coverage. Below 70%
            coverage, view stays neutral. Build-up uses spot movement and aggregate option OI, not
            futures positioning. Support/resistance rank OI plus positive daily OI change.
          </p>
          {latest?.pillars.map((p) => (
            <p key={p.key} className="mt-2">
              {labels[p.key]} ({p.weight}%): {p.reason}
            </p>
          ))}
          <p className="mt-2">
            History uses completed Upstox option candles and previous-close OI baselines. No
            synthetic interpolation. Missing contracts/minutes remain gaps. Index candles may lack
            volume: VWAP then remains unavailable. Momentum resets after gaps and ATM basket
            changes. OHLC is session-to-observation; net change is measured from the previous close.
          </p>
        </details>
      </div>
      <div className="px-4">
        {latest && (
          <OptionChainChart strikes={latest.strikes} spot={latest.spot} atm={latest.atm} />
        )}
      </div>
      <div className="px-4 py-3 flex flex-wrap justify-between gap-2 text-zinc-400">
        <span>
          SESSION LOG / NEWEST FIRST · {rows.length} observations ·{" "}
          {timeline.filter((t) => !t.row).length} gaps
        </span>
        <span>
          {data?.backfilling
            ? "V3 OPTION CANDLE BACKFILL IN PROGRESS"
            : "CAPTURED + VERIFIED CANDLE HISTORY"}
        </span>
      </div>
      <div
        className="overflow-auto max-h-[620px] border-t border-zinc-800"
        tabIndex={0}
        aria-label="Scrollable OI session log"
      >
        <table className="w-full min-w-[1350px] text-right whitespace-nowrap">
          <caption className="sr-only">
            Minute-by-minute OI direction scanner, all times in IST
          </caption>
          <thead className="sticky top-0 bg-[#171e29] text-[10px] text-zinc-400">
            <tr>
              {[
                "TIME IST",
                "LTP",
                "CHNG. IN CALL OI",
                "CHNG. IN PUT OI",
                "DIFF. IN OI",
                "CHNG. IN DIRECTION",
                "DIRECTION OF CHNG.",
                "NET PCR",
                "SUPPORT",
                "RESISTANCE",
                "BUILD-UP",
                "VIEW",
              ].map((h) => (
                <th scope="col" className="px-3 py-3" key={h}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...timeline].reverse().map(({ timestamp, row }) =>
              row ? (
                <ScannerRow key={timestamp} row={row} compact={compact} />
              ) : (
                <tr key={timestamp} className="border-t border-zinc-800/60 text-zinc-600">
                  <td className="px-3 py-2">{clock(timestamp)}</td>
                  <td colSpan={11} className="text-left px-3">
                    GAP · No verified option OI observation
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
        {!timeline.length && (
          <p className="p-8 text-center text-zinc-500">
            {query.isPending
              ? "Connecting to the canonical Upstox pipeline…"
              : "No session log available. Collection runs 09:15–15:30 IST on open market sessions."}
          </p>
        )}
      </div>
    </section>
  );
}
function ScannerRow({ row: r, compact }: { row: OiRow; compact: boolean }) {
  return (
    <tr className="border-t border-zinc-800/70 hover:bg-zinc-800/30">
      <td className="px-3 py-3 text-left" title={r.source}>
        {clock(r.timestamp)}
        <small className="block text-[9px] text-zinc-500">
          {r.source === "CAPTURED" ? "CAPTURED" : "CANDLE HISTORY"}
        </small>
      </td>
      <td className="px-3">{money(r.spot)}</td>
      {[r.callChange, r.putChange, r.diff, r.momentum].map((v, i) => (
        <td key={i} className={`px-3 ${tone(v)}`}>
          {formatOi(v, compact)}
        </td>
      ))}
      <td className={`px-3 text-[10px] ${tone(r.momentum)}`}>{r.direction}</td>
      <td className="px-3 text-teal-300" title={pcrRegime(r.pcr)}>
        {r.pcr?.toFixed(3) ?? "—"}
      </td>
      <td className="px-3">{money(r.support)}</td>
      <td className="px-3">{money(r.resistance)}</td>
      <td className="px-3 text-[10px]">{r.buildup}</td>
      <td
        className={`px-3 text-[10px] ${r.view === "BULLISH" ? "text-emerald-400" : r.view === "BEARISH" ? "text-rose-400" : r.view === "REVERSAL WATCH" ? "text-amber-300" : "text-zinc-400"}`}
      >
        {r.view}
      </td>
    </tr>
  );
}
